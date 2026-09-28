import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import type { BrowserId, BrowserInfo, BrowserProfile, ExtensionSetup } from '@shared/types'
import { EXTENSION_STORES } from '@shared/support'

/**
 * Finds installed browsers and helps put the Downly extension into them.
 * Chrome/Edge only accept extensions from their stores silently, so for Chromium
 * browsers we open the extensions page and hand the user the folder to "Load unpacked";
 * Firefox can install a signed .xpi with a single "Add" click.
 */

const env = (name: string) => process.env[name] ?? ''

const CANDIDATES: Record<BrowserId, { name: string; kind: BrowserInfo['kind']; win: string[]; mac: string[]; linux: string[] }> = {
  chrome: {
    name: 'Google Chrome',
    kind: 'chromium',
    win: ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'].map((v) => join(env(v), 'Google/Chrome/Application/chrome.exe')),
    mac: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']
  },
  edge: {
    name: 'Microsoft Edge',
    kind: 'chromium',
    win: ['ProgramFiles(x86)', 'ProgramFiles'].map((v) => join(env(v), 'Microsoft/Edge/Application/msedge.exe')),
    mac: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable']
  },
  brave: {
    name: 'Brave',
    kind: 'chromium',
    win: ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'].map((v) => join(env(v), 'BraveSoftware/Brave-Browser/Application/brave.exe')),
    mac: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    linux: ['/usr/bin/brave-browser', '/usr/bin/brave', '/snap/bin/brave']
  },
  opera: {
    name: 'Opera',
    kind: 'chromium',
    win: [join(env('LOCALAPPDATA'), 'Programs/Opera/opera.exe'), join(env('LOCALAPPDATA'), 'Programs/Opera GX/opera.exe')],
    mac: ['/Applications/Opera.app/Contents/MacOS/Opera', '/Applications/Opera GX.app/Contents/MacOS/Opera'],
    linux: ['/usr/bin/opera']
  },
  vivaldi: {
    name: 'Vivaldi',
    kind: 'chromium',
    win: [join(env('LOCALAPPDATA'), 'Vivaldi/Application/vivaldi.exe'), join(env('ProgramFiles'), 'Vivaldi/Application/vivaldi.exe')],
    mac: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
    linux: ['/usr/bin/vivaldi', '/usr/bin/vivaldi-stable']
  },
  firefox: {
    name: 'Firefox',
    kind: 'firefox',
    win: ['ProgramFiles', 'ProgramFiles(x86)'].map((v) => join(env(v), 'Mozilla Firefox/firefox.exe')),
    mac: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
    linux: ['/usr/bin/firefox', '/snap/bin/firefox']
  }
}

const exists = (p: string) => stat(p).then(() => true, () => false)

/** Where each Chromium browser keeps its profiles ("Local State" lists them) */
const USER_DATA: Partial<Record<BrowserId, { win: string; mac: string; linux: string }>> = {
  chrome: { win: 'Google/Chrome/User Data', mac: 'Google/Chrome', linux: 'google-chrome' },
  edge: { win: 'Microsoft/Edge/User Data', mac: 'Microsoft Edge', linux: 'microsoft-edge' },
  brave: { win: 'BraveSoftware/Brave-Browser/User Data', mac: 'BraveSoftware/Brave-Browser', linux: 'BraveSoftware/Brave-Browser' },
  vivaldi: { win: 'Vivaldi/User Data', mac: 'Vivaldi', linux: 'vivaldi' }
}

function userDataDir(id: BrowserId): string | null {
  const dirs = USER_DATA[id]
  if (!dirs) return null
  if (process.platform === 'win32') return join(env('LOCALAPPDATA'), dirs.win)
  if (process.platform === 'darwin') return join(homedir(), 'Library/Application Support', dirs.mac)
  return join(homedir(), '.config', dirs.linux)
}

/** A browser's profiles by their display names, the one used last first */
async function readProfiles(id: BrowserId): Promise<BrowserProfile[]> {
  const dir = userDataDir(id)
  if (!dir) return []
  try {
    const state = JSON.parse(await readFile(join(dir, 'Local State'), 'utf8'))
    const cache: Record<string, { name?: string }> = state.profile?.info_cache ?? {}
    const last: string | undefined = state.profile?.last_used
    return Object.entries(cache)
      .map(([folder, info]) => ({ dir: folder, name: info.name || folder }))
      .sort((a, b) => Number(b.dir === last) - Number(a.dir === last))
  } catch {
    return []
  }
}

export async function detectBrowsers(): Promise<BrowserInfo[]> {
  const key = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const found: BrowserInfo[] = []
  for (const [id, c] of Object.entries(CANDIDATES) as [BrowserId, (typeof CANDIDATES)[BrowserId]][]) {
    for (const path of c[key]) {
      if (path && (await exists(path))) {
        found.push({
          id,
          name: c.name,
          kind: c.kind,
          path,
          profiles: c.kind === 'chromium' ? await readProfiles(id) : [],
          extensionsUrl: c.kind === 'firefox' ? 'about:addons' : `${id}://extensions`
        })
        break
      }
    }
  }
  return found
}

/** The extension as shipped with the app (resources/extension when packaged) */
function bundledExtensionDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'extension') : join(__dirname, '../../extension')
}

async function copyDir(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name)
    const dst = join(to, entry.name)
    if (entry.isDirectory()) await copyDir(src, dst)
    else await copyFile(src, dst)
  }
}

/**
 * Microsoft Store (MSIX) builds: Windows redirects what the app writes under AppData to a
 * private per-package folder, so other programs (the browser) don't see it at the usual path.
 * Returns where the file really is, or the path unchanged outside the Store build.
 */
async function pathOutsidePackage(path: string): Promise<string> {
  if (!process.windowsStore) return path
  // The app runs from ...\WindowsApps\<Name>_<Version>_<Arch>_<ResourceId>_<PublisherId>pp\Downly.exe
  const parts = basename(dirname(dirname(process.execPath))).split('_')
  if (parts.length < 5) return path
  const family = `${parts[0]}_${parts[parts.length - 1]}`
  const appData = dirname(app.getPath('appData')) // ...\AppData
  const real = join(appData, 'Local', 'Packages', family, 'LocalCache', relative(appData, path))
  return (await exists(real)) ? real : path
}

/**
 * Copies the extension to a stable per-user folder (the app folder can move on update,
 * and macOS may run the app from a random translocated path) and returns that folder.
 */
export async function prepareExtensionFolder(): Promise<string> {
  const target = join(app.getPath('userData'), 'browser-extension')
  await rm(target, { recursive: true, force: true })
  await copyDir(bundledExtensionDir(), target)
  return pathOutsidePackage(target)
}

const manifestVersion = async (dir: string): Promise<string> =>
  JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')).version

/**
 * After an app update, puts the new extension files in the folder the browser loads them from
 * (the extension then sees the newer app and reloads itself). Nothing to do if never set up.
 */
export async function refreshExtensionFolder(): Promise<void> {
  const target = join(app.getPath('userData'), 'browser-extension')
  const installed = await manifestVersion(target).catch(() => null)
  if (!installed || installed === (await manifestVersion(bundledExtensionDir()))) return
  await rm(target, { recursive: true, force: true })
  await copyDir(bundledExtensionDir(), target)
}

/** Signed Firefox package, present only when the release pipeline had AMO signing keys */
async function firefoxPackage(): Promise<string | null> {
  const xpi = join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'), 'downly-firefox.xpi')
  return (await exists(xpi)) ? xpi : null
}

/** The store page that installs the extension in this browser, if one is set */
function storePage(browser: BrowserInfo): string {
  if (browser.kind !== 'chromium') return ''
  return (browser.id === 'edge' && EXTENSION_STORES.edge) || EXTENSION_STORES.chrome
}

/**
 * Opens the browser (in the chosen profile) where the extension gets added. Browsers refuse
 * to open their own pages (chrome://extensions…) from outside, so for the developer-mode route
 * the window opens empty and the user pastes the address, which the app copies.
 */
export async function setupExtension(browser: BrowserInfo, profileDir?: string): Promise<ExtensionSetup> {
  const folder = await prepareExtensionFolder()
  const profile = profileDir && browser.profiles.some((p) => p.dir === profileDir) ? [`--profile-directory=${profileDir}`] : []
  if (browser.kind === 'firefox') {
    const xpi = await firefoxPackage()
    launch(browser.path, [xpi ?? 'about:debugging#/runtime/this-firefox'])
    return { folder, oneClick: !!xpi, store: false }
  }
  const store = storePage(browser)
  launch(browser.path, store ? [...profile, store] : [...profile, '--new-window'])
  return { folder, oneClick: false, store: !!store }
}

export function showFolder(folder: string): void {
  void shell.openPath(folder)
}

function launch(exe: string, args: string[]): void {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}
