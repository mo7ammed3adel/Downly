import { app, BrowserWindow, clipboard, Menu, nativeImage, nativeTheme, Notification, shell, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { AppState, ExternalAddRequest, MediaOptions, NewDownloadRequest } from '@shared/types'
import { translate } from '@shared/i18n'
import { parseSpotifyUrl } from '@shared/util'
import { SUPPORT_PROMPT_AFTER } from '@shared/support'
import { DownloadManager } from './engine/DownloadManager'
import { buildHeaders, createFetcher, discard, httpRequest, probe } from './engine/http'
import { analyze, type YtdlpEnv } from './engine/ytdlp'
import { BrowserBridge } from './services/bridge'
import { Binaries } from './services/binaries'
import { refreshExtensionFolder } from './services/browsers'
import { installerFor, Updater } from './services/updater'
import { Subscriptions } from './services/subscriptions'
import { startLog } from './services/log'
import { ClipboardMonitor } from './services/clipboard'
import { createProxyResolver, proxyFor } from './services/network'
import { Scheduler } from './services/scheduler'
import { SettingsStore } from './services/settings'
import { registerIpc } from './ipc'

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.setAppUserModelId('com.downly.app')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

startLog()
const settings = new SettingsStore()
const proxyResolver = createProxyResolver(() => settings.get())
const binaries = new Binaries(proxyResolver)
const updater = new Updater({
  currentVersion: app.getVersion(),
  installer: installerFor(process.platform, process.versions.electron, process.arch, process.windowsStore === true),
  fetch: createFetcher(proxyResolver),
  proxyFor: proxyResolver,
  runInstaller: (path) => {
    // /S installs over the current copy without questions; --force-run opens Downly afterwards
    spawn(path, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
    void quit()
  }
})
const UPDATE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const subscriptions = new Subscriptions({
  file: join(app.getPath('userData'), 'subscriptions.json'),
  list: async (url, extraArgs) => analyze(url, await ytdlpEnv(url), undefined, {}, extraArgs),
  download: async (sub, entries) => {
    await manager.add(
      entries.map((e) => ({ url: e.url, kind: 'media' as const, title: e.title, thumbnail: e.thumbnail, playlistTitle: sub.title, media: defaultMediaOptions(sub.mode) }))
    )
  }
})
const SUBSCRIPTION_CHECK_EVERY_MS = 3 * 60 * 60 * 1000
/** yt-dlp needs Node 20+ as a JS runtime; the Windows 7 build (Electron 22) ships Node 16 */
const nodeRuntimeOk = Number(process.versions.node.split('.')[0]) >= 20

async function ytdlpEnv(url: string): Promise<YtdlpEnv> {
  await binaries.ensureYtdlp()
  return {
    ytdlpPath: binaries.ytdlpPath,
    ffmpegPath: binaries.ffmpegPath,
    // Electron doubles as Node (ELECTRON_RUN_AS_NODE) for YouTube's JS challenges
    nodePath: nodeRuntimeOk ? process.execPath : null,
    supportsJsRuntimes: await binaries.supports('--js-runtimes'),
    proxy: await proxyFor(url, settings.get(), true),
    settings: settings.get()
  }
}

const manager = new DownloadManager({
  dataFile: join(app.getPath('userData'), 'downloads.json'),
  getSettings: () => settings.get(),
  proxyFor: proxyResolver,
  ytdlpEnv
})

const bridge = new BrowserBridge(() => settings.get(), app.getVersion(), canFetchFromBrowser)
const clipboardMonitor = new ClipboardMonitor(() => settings.get())
const scheduler = new Scheduler(
  () => settings.get().scheduler,
  { start: () => manager.resumeAll(), stop: () => manager.pauseAll() }
)

const t = (key: string, vars?: Record<string, string | number>) => translate(settings.get().language, key, vars)
const resource = (name: string) => join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'), name)

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function getState(): AppState {
  return {
    downloads: manager.list(),
    settings: settings.get(),
    components: binaries.state,
    version: app.getVersion(),
    platform: process.platform,
    windowsStore: process.windowsStore === true
  }
}

function showWindow(): void {
  if (!win || win.isDestroyed()) createWindow()
  if (win!.isMinimized()) win!.restore()
  win!.show()
  win!.focus()
}

/**
 * Windows refuses to let a background app take focus from the browser, so a plain
 * focus() only flashes the taskbar. Pinning on top for a moment brings us to the front.
 */
function bringToFront(): void {
  showWindow()
  const w = win!
  w.setAlwaysOnTop(true, 'screen-saver')
  w.moveTop()
  w.focus()
  app.focus({ steal: true })
  // Windows allows activating a window that is being restored from minimized
  if (process.platform === 'win32' && !w.isFocused()) {
    w.minimize()
    w.restore()
    w.focus()
  }
  w.flashFrame(!w.isFocused())
  setTimeout(() => !w.isDestroyed() && w.setAlwaysOnTop(false), 1500)
}

let rendererReady = false
const queued: [string, unknown][] = []

/** Like send(), but holds messages until the UI has loaded (window may have just been created) */
function sendToUi(channel: string, payload: unknown): void {
  if (rendererReady && win && !win.isDestroyed()) send(channel, payload)
  else queued.push([channel, payload])
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 820,
    minHeight: 520,
    show: false,
    title: 'Downly',
    icon: resource('icon.png'),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win?.show()
  })
  win.on('close', (e) => {
    if (!quitting && settings.get().minimizeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })
  rendererReady = false
  win.webContents.on('did-finish-load', () => {
    rendererReady = true
    for (const [channel, payload] of queued.splice(0)) send(channel, payload)
  })
  win.on('focus', () => win?.flashFrame(false))
  win.on('closed', () => (win = null))
  // Links in the UI open in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function buildTray(): void {
  const icon = nativeImage.createFromPath(resource('tray.png'))
  tray ??= new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Downly')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: showWindow },
      {
        label: t('tray.add'),
        click: () => {
          showWindow()
          send('external:add', { url: clipboard.readText().trim() } satisfies ExternalAddRequest)
        }
      },
      { type: 'separator' },
      { label: t('tray.resumeAll'), click: () => manager.resumeAll() },
      { label: t('tray.pauseAll'), click: () => manager.pauseAll() },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => quit() }
    ])
  )
  tray.on('click', showWindow)
}

/**
 * Before taking a download away from the browser: ask for its first byte with the browser's
 * cookies/Referer/headers. A refusal, or a web page where a file was expected (login page,
 * expired or single-use link), means the browser should keep it.
 */
async function canFetchFromBrowser(req: ExternalAddRequest): Promise<boolean> {
  const s = settings.get()
  const headers = buildHeaders(req.userAgent || s.userAgent, req.headers, req.cookies, req.referrer)
  const wantedPage = /\.html?$/i.test(req.fileName ?? '')
  try {
    if (req.form) {
      // Submit the same form and look only at the answer's headers
      const res = await httpRequest(req.url, {
        headers: { ...headers, 'content-type': req.form.contentType },
        method: 'POST',
        body: req.form.body,
        timeoutMs: 15_000,
        proxyFor: proxyResolver
      })
      discard(res.body)
      const mime = String(res.headers['content-type'] ?? '').split(';')[0].trim()
      return res.statusCode < 400 && (mime !== 'text/html' || wantedPage)
    }
    const meta = await probe(req.url, { headers, timeoutMs: 10_000, proxyFor: proxyResolver })
    return meta.mime !== 'text/html' || wantedPage
  } catch {
    return false
  }
}

/** The media options a download gets without the add dialog (quick mode, songs, subscriptions) */
function defaultMediaOptions(mode: 'video' | 'audio'): MediaOptions {
  const m = settings.get().media
  return {
    mode,
    quality: m.defaultQuality,
    container: m.defaultContainer,
    audioFormat: m.defaultAudioFormat,
    audioBitrate: 0,
    subtitles: mode === 'video' && m.subtitles,
    subtitleLangs: m.subtitleLangs,
    embedThumbnail: m.embedThumbnail
  }
}

/** Browser handed us a link: show the dialog (IDM style) or start straight away */
function handleExternal(req: ExternalAddRequest): void {
  const s = settings.get()
  console.log(`[bridge] ${req.media ? 'media' : 'file'}${req.quick ? ' (quick)' : ''} ${req.url}`)
  const m = s.media
  const defaults = defaultMediaOptions
  // Songs read off a music site: the click already chose them, download the audio right away
  if (req.tracks?.length) {
    const many = req.tracks.length > 1
    void manager
      .add(
        req.tracks.map((track) => ({
          url: req.pageUrl ?? req.url,
          kind: 'spotify' as const,
          title: `${track.artist} - ${track.title}`,
          thumbnail: track.cover,
          track,
          playlistTitle: many ? req.collection : undefined,
          media: defaults('audio')
        }))
      )
      .then((added) => notify(t('notify.quickAdded'), added.map((i) => i.title).slice(0, 3).join('\n'), showWindow))
    return
  }
  // Quick mode: one click on a video starts it with the default quality. Spotify links and
  // playlist pages still need the dialog to pick tracks/items.
  // A form download can't be previewed (the dialog would re-request it without the form): start it
  if (req.form) {
    void manager
      .add([
        {
          url: req.url,
          kind: 'http',
          post: req.form,
          fileName: req.fileName,
          size: req.size,
          referrer: req.referrer,
          pageUrl: req.pageUrl,
          cookies: req.cookies,
          headers: { ...req.headers, ...(req.userAgent ? { 'user-agent': req.userAgent } : {}) }
        }
      ])
      .then((added) => notify(t('notify.quickAdded'), added[0]?.fileName ?? req.url, showWindow))
    return
  }
  const needsDialog = parseSpotifyUrl(req.url) || /[?&]list=|\/playlist\b/.test(req.url)
  if (req.quick && req.media && !needsDialog) {
    void manager
      .add([
        {
          url: req.url,
          kind: 'media',
          pageUrl: req.pageUrl,
          cookies: req.cookies,
          referrer: req.referrer,
          headers: { ...req.headers, ...(req.userAgent ? { 'user-agent': req.userAgent } : {}) },
          media: defaults(req.mode ?? m.defaultMode)
        }
      ])
      .then(() => notify(t('notify.quickAdded'), req.url, showWindow))
    return
  }
  if (s.confirmBrowserDownloads || req.media) {
    bringToFront()
    sendToUi('external:add', req)
    return
  }
  const add: NewDownloadRequest = {
    url: req.url,
    kind: 'http',
    fileName: req.fileName,
    size: req.size,
    referrer: req.referrer,
    pageUrl: req.pageUrl,
    cookies: req.cookies,
    headers: req.headers || req.userAgent ? { ...req.headers, ...(req.userAgent ? { 'user-agent': req.userAgent } : {}) } : undefined
  }
  void manager.add([add])
}

/** Free app: after enough finished downloads, ask once (politely) for a donation */
function countForSupportPrompt(): void {
  const { completedCount, prompted } = settings.get().support
  const next = completedCount + 1
  settings.update({ support: { completedCount: next, prompted: prompted || next >= SUPPORT_PROMPT_AFTER } })
  if (!prompted && next >= SUPPORT_PROMPT_AFTER) sendToUi('support:prompt', null)
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!settings.get().notifications || !Notification.isSupported()) return
  const n = new Notification({ title, body, icon: resource('icon.png') })
  if (onClick) n.on('click', onClick)
  n.show()
}

function applySystemSettings(): void {
  const s = settings.get()
  nativeTheme.themeSource = s.theme
  // Store packages virtualize the registry Run key, so this would silently do nothing there
  if (app.isPackaged && !process.windowsStore) app.setLoginItemSettings({ openAtLogin: s.startWithSystem, args: ['--hidden'] })
  bridge.apply()
  clipboardMonitor.apply()
  manager.applySettings()
  buildTray()
}

async function quit(): Promise<void> {
  quitting = true
  bridge.stop()
  scheduler.dispose()
  await manager.shutdown()
  app.exit(0)
}

app.on('second-instance', showWindow)
app.on('before-quit', (e) => {
  if (!quitting) {
    e.preventDefault()
    void quit()
  }
})
app.on('window-all-closed', () => {
  if (!settings.get().minimizeToTray) void quit()
})
app.on('activate', showWindow)

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  await manager.load()
  await subscriptions.load()

  settings.on('changed', (s) => {
    applySystemSettings()
    send('settings:changed', s)
  })
  binaries.on('state', (state) => send('components:changed', state))
  updater.on('state', (state) => send('update:state', state))
  subscriptions.on('changed', (subs) => send('subs:changed', subs))
  subscriptions.on('downloaded', ({ sub, count }) => notify(t('notify.subscription', { count, title: sub.title }), sub.title, showWindow))
  // New videos on followed channels/playlists: shortly after start, then every few hours
  setTimeout(() => void subscriptions.checkAll(), 60_000)
  setInterval(() => void subscriptions.checkAll(), SUBSCRIPTION_CHECK_EVERY_MS)
  // Only installed copies update themselves (a dev run has nothing to replace)
  const checkForUpdate = () => app.isPackaged && settings.get().autoUpdateCheck && void updater.check()
  setTimeout(checkForUpdate, 15_000)
  setInterval(checkForUpdate, UPDATE_CHECK_EVERY_MS)
  manager.on('changed', (items) => send('downloads:changed', items))
  manager.on('removed', (ids) => send('downloads:removed', ids))
  manager.on('completed', (item) => {
    notify(t('notify.completed'), item.fileName, () => shell.showItemInFolder(join(item.directory, item.fileName)))
    countForSupportPrompt()
  })
  manager.on('failed', (item) => {
    console.log(`[download] failed ${item.url}: ${item.error ?? ''}`)
    notify(t('notify.failed'), `${item.fileName}\n${item.error ?? ''}`, showWindow)
  })
  manager.on('idle', () => {
    if (scheduler.afterDone()) void quit()
  })
  bridge.on('add', handleExternal)
  bridge.on('extension-outdated', () => {
    bringToFront()
    sendToUi('extension:outdated', null)
  })
  bridge.on('file', ({ path, fileName, pageUrl }: { path: string; fileName: string; pageUrl?: string }) => {
    manager.importFile(path, fileName, pageUrl).catch((err) => notify(t('notify.failed'), `${fileName}
${err}`))
  })
  bridge.on('batch', ({ urls }: { urls: string[] }) => {
    bringToFront()
    sendToUi('external:batch', urls)
  })
  clipboardMonitor.on('url', (url: string) =>
    notify(t('notify.clipboard'), url, () => {
      bringToFront()
      sendToUi('external:add', { url } satisfies ExternalAddRequest)
    })
  )

  registerIpc({ manager, settings, binaries, bridge, updater, subscriptions, proxyFor: proxyResolver, ytdlpEnv, getState, getWindow: () => win })
  createWindow()
  applySystemSettings()
  scheduler.run()
  void binaries.init()
  refreshExtensionFolder().catch(() => {})
})
