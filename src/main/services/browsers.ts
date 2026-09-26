import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserId, BrowserInfo } from '@shared/types'

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

export async function detectBrowsers(): Promise<BrowserInfo[]> {
  const key = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const found: BrowserInfo[] = []
  for (const [id, c] of Object.entries(CANDIDATES) as [BrowserId, (typeof CANDIDATES)[BrowserId]][]) {
    for (const path of c[key]) {
      if (path && (await exists(path))) {
        found.push({ id, name: c.name, kind: c.kind, path })
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
 * Copies the extension to a stable per-user folder (the app folder can move on update,
 * and macOS may run the app from a random translocated path) and returns that folder.
 */
export async function prepareExtensionFolder(): Promise<string> {
  const target = join(app.getPath('userData'), 'browser-extension')
  await rm(target, { recursive: true, force: true })
  await copyDir(bundledExtensionDir(), target)
  return target
}

/** Signed Firefox package, present only when the release pipeline had AMO signing keys */
async function firefoxPackage(): Promise<string | null> {
  const xpi = join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'), 'downly-firefox.xpi')
  return (await exists(xpi)) ? xpi : null
}

export interface SetupResult {
  folder: string
  /** true when Firefox got a signed package it can install with one click */
  oneClick: boolean
}

export async function setupExtension(browser: BrowserInfo): Promise<SetupResult> {
  const folder = await prepareExtensionFolder()
  if (browser.kind === 'firefox') {
    const xpi = await firefoxPackage()
    launch(browser.path, [xpi ?? 'about:debugging#/runtime/this-firefox'])
    return { folder, oneClick: !!xpi }
  }
  launch(browser.path, [`${browser.id === 'chrome' ? 'chrome' : browser.id}://extensions/`])
  return { folder, oneClick: false }
}

export function openExtensionsPage(browser: BrowserInfo): void {
  if (browser.kind === 'firefox') launch(browser.path, ['about:addons'])
  else launch(browser.path, [`${browser.id}://extensions/`])
}

export function showFolder(folder: string): void {
  void shell.openPath(folder)
}

function launch(exe: string, args: string[]): void {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}
