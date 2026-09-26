import { app, BrowserWindow, clipboard, Menu, nativeImage, nativeTheme, Notification, shell, Tray } from 'electron'
import { join } from 'node:path'
import type { AppState, ExternalAddRequest, NewDownloadRequest } from '@shared/types'
import { translate } from '@shared/i18n'
import { parseSpotifyUrl } from '@shared/util'
import { SUPPORT_PROMPT_AFTER } from '@shared/support'
import { DownloadManager } from './engine/DownloadManager'
import type { YtdlpEnv } from './engine/ytdlp'
import { BrowserBridge } from './services/bridge'
import { Binaries } from './services/binaries'
import { refreshExtensionFolder } from './services/browsers'
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

const settings = new SettingsStore()
const proxyResolver = createProxyResolver(() => settings.get())
const binaries = new Binaries(proxyResolver)
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

const bridge = new BrowserBridge(() => settings.get(), app.getVersion())
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

/** Browser handed us a link: show the dialog (IDM style) or start straight away */
function handleExternal(req: ExternalAddRequest): void {
  const s = settings.get()
  console.log(`[bridge] ${req.media ? 'media' : 'file'}${req.quick ? ' (quick)' : ''} ${req.url}`)
  // Quick mode: one click on a video starts it with the default quality. Spotify links and
  // playlist pages still need the dialog to pick tracks/items.
  const needsDialog = parseSpotifyUrl(req.url) || /[?&]list=|\/playlist\b/.test(req.url)
  if (req.quick && req.media && !needsDialog) {
    const m = s.media
    void manager
      .add([
        {
          url: req.url,
          kind: 'media',
          pageUrl: req.pageUrl,
          media: {
            mode: req.mode ?? m.defaultMode,
            quality: m.defaultQuality,
            container: m.defaultContainer,
            audioFormat: m.defaultAudioFormat,
            audioBitrate: 0,
            subtitles: false,
            subtitleLangs: 'en.*,ar.*',
            embedThumbnail: m.embedThumbnail
          }
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
    headers: req.userAgent ? { 'user-agent': req.userAgent } : undefined
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

  settings.on('changed', (s) => {
    applySystemSettings()
    send('settings:changed', s)
  })
  binaries.on('state', (state) => send('components:changed', state))
  manager.on('changed', (items) => send('downloads:changed', items))
  manager.on('removed', (ids) => send('downloads:removed', ids))
  manager.on('completed', (item) => {
    notify(t('notify.completed'), item.fileName, () => shell.showItemInFolder(join(item.directory, item.fileName)))
    countForSupportPrompt()
  })
  manager.on('failed', (item) => notify(t('notify.failed'), `${item.fileName}\n${item.error ?? ''}`, showWindow))
  manager.on('idle', () => {
    if (scheduler.afterDone()) void quit()
  })
  bridge.on('add', handleExternal)
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

  registerIpc({ manager, settings, binaries, bridge, proxyFor: proxyResolver, ytdlpEnv, getState, getWindow: () => win })
  createWindow()
  applySystemSettings()
  scheduler.run()
  void binaries.init()
  refreshExtensionFolder().catch(() => {})
})
