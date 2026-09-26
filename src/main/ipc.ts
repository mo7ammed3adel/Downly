import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import type { AppState, NewDownloadRequest, ProbeRequest, ProbeResult, SettingsPatch } from '@shared/types'
import { extensionOf, isKnownMediaSite, parseSpotifyUrl } from '@shared/util'
import type { DownloadManager } from './engine/DownloadManager'
import { buildHeaders, createFetcher, probe, type ProxyResolver } from './engine/http'
import { resolveSpotify } from './engine/spotify'
import { analyze, type YtdlpEnv } from './engine/ytdlp'
import { partPath } from './engine/HttpDownload'
import type { Binaries } from './services/binaries'
import type { SettingsStore } from './services/settings'
import type { BrowserBridge } from './services/bridge'
import { detectBrowsers, openExtensionsPage, setupExtension, showFolder } from './services/browsers'

interface Deps {
  manager: DownloadManager
  settings: SettingsStore
  binaries: Binaries
  bridge: BrowserBridge
  proxyFor: ProxyResolver
  ytdlpEnv(url: string): Promise<YtdlpEnv>
  getState(): AppState
  getWindow(): BrowserWindow | null
}

const STREAM_EXT = new Set(['m3u8', 'mpd'])
const STREAM_MIME = /mpegurl|dash\+xml/i

export function registerIpc(d: Deps): void {
  const { manager, settings, binaries, ytdlpEnv } = d
  let probeAbort: AbortController | null = null

  async function probeUrl(req: ProbeRequest): Promise<ProbeResult> {
    probeAbort?.abort()
    const abort = (probeAbort = new AbortController())
    const url = req.url.trim()

    if (parseSpotifyUrl(url)) {
      return { kind: 'spotify', info: await resolveSpotify(url, settings.get().spotify, createFetcher(d.proxyFor)) }
    }

    const path = (() => {
      try {
        return new URL(url).pathname
      } catch {
        throw new Error('Invalid URL')
      }
    })()
    if (isKnownMediaSite(url) || STREAM_EXT.has(extensionOf(path))) {
      return { kind: 'media', info: await analyze(url, await ytdlpEnv(url), abort.signal, req) }
    }

    const s = settings.get()
    const headers = buildHeaders(req.userAgent || s.userAgent, req.headers, req.cookies, req.referrer)
    const meta = await probe(url, { headers, timeoutMs: s.timeoutSec * 1000, proxyFor: d.proxyFor, signal: abort.signal })
    // A web page or a stream playlist: let yt-dlp look for embedded media
    if (meta.mime === 'text/html' || (meta.mime && STREAM_MIME.test(meta.mime))) {
      try {
        return { kind: 'media', info: await analyze(url, await ytdlpEnv(url), abort.signal, req) }
      } catch {
        /* no media on the page — offer it as a plain file */
      }
    }
    return { kind: 'http', url, fileName: meta.fileName, size: meta.size, resumable: meta.resumable, mime: meta.mime }
  }

  ipcMain.handle('state:get', () => d.getState())
  ipcMain.handle('probe', (_e, req: ProbeRequest) => probeUrl(req))
  ipcMain.handle('probe:cancel', () => probeAbort?.abort())

  ipcMain.handle('downloads:add', (_e, reqs: NewDownloadRequest[]) => manager.add(reqs))
  ipcMain.handle('downloads:pause', (_e, ids: string[]) => manager.pause(ids))
  ipcMain.handle('downloads:resume', (_e, ids: string[]) => manager.resume(ids))
  ipcMain.handle('downloads:restart', (_e, ids: string[]) => manager.restart(ids))
  ipcMain.handle('downloads:remove', (_e, ids: string[], deleteFiles: boolean) => manager.remove(ids, deleteFiles))
  ipcMain.handle('downloads:pauseAll', () => manager.pauseAll())
  ipcMain.handle('downloads:resumeAll', () => manager.resumeAll())
  ipcMain.handle('downloads:clearCompleted', () => manager.clearCompleted())
  ipcMain.handle('downloads:refreshUrl', (_e, id: string, url: string) => manager.refreshUrl(id, url))
  ipcMain.handle('downloads:open', async (_e, id: string) => {
    const item = manager.get(id)
    if (item?.status === 'completed') return shell.openPath(join(item.directory, item.fileName))
  })
  ipcMain.handle('downloads:openFolder', (_e, id: string) => {
    const item = manager.get(id)
    if (!item) return
    if (item.status === 'completed') shell.showItemInFolder(join(item.directory, item.fileName))
    else if (item.kind === 'http' && item.segments.length) shell.showItemInFolder(partPath(item))
    else void shell.openPath(item.directory)
  })

  ipcMain.handle('settings:update', (_e, patch: SettingsPatch) => settings.update(patch))
  ipcMain.handle('dialog:chooseDir', async (_e, current?: string) => {
    const win = d.getWindow()
    const opts = { defaultPath: current, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : res.filePaths[0]
  })


  ipcMain.handle('components:update', () => binaries.update())

  // Browser extension setup wizard
  const findBrowser = async (id: string) => (await detectBrowsers()).find((b) => b.id === id)
  ipcMain.handle('browsers:list', () => detectBrowsers())
  ipcMain.handle('extension:setup', async (_e, id: string) => {
    const browser = await findBrowser(id)
    if (!browser) throw new Error('Browser not found')
    const result = await setupExtension(browser)
    clipboard.writeText(result.folder)
    return result
  })
  ipcMain.handle('extension:openPage', async (_e, id: string) => {
    const browser = await findBrowser(id)
    if (browser) openExtensionsPage(browser)
  })
  ipcMain.handle('extension:showFolder', (_e, folder: string) => showFolder(folder))
  ipcMain.handle('extension:lastSeen', () => d.bridge.lastSeen)
  ipcMain.handle('idm:running', () => isIdmRunning())
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('shell:openPath', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('clipboard:read', () => clipboard.readText())
}

/**
 * IDM hooks into browsers below the extension level and grabs downloads before Downly sees
 * them, so the UI warns when it is running (Windows only).
 */
function isIdmRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) =>
    execFile('tasklist', ['/FI', 'IMAGENAME eq IDMan.exe', '/NH'], { windowsHide: true }, (err, out) =>
      resolve(!err && /IDMan\.exe/i.test(out))
    )
  )
}
