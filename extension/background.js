/* Downly browser integration — works as a Chrome MV3 service worker and a Firefox background script. */
const ext = globalThis.browser ?? globalThis.chrome
// Chrome's service worker loads the shared strings here; Firefox lists i18n.js in the manifest
if (typeof globalThis.SG_I18N === 'undefined' && typeof importScripts === 'function') importScripts('i18n.js')
const DEFAULT_PORT = 58732
/** The app moves to the next port when another program holds one; same range as the app */
const PORTS = Array.from({ length: 10 }, (_, i) => DEFAULT_PORT + i)
const MEDIA_EXT = /\.(m3u8|mpd|mp4|webm|mkv|mov|flv|m4a|mp3|ogg|opus|aac|wav|flac)(\?|$)/i
const MEDIA_MIME = /^(video|audio)\/|mpegurl|dash\+xml/i

/** URLs we handed back to the browser (app unreachable) — don't intercept them twice */
const bypass = new Set()
let config = null
let configAt = 0
/** Port the app answered on last (null = not found) */
let appPort = null

const t = (key) => globalThis.SG_I18N.t(key)

async function settings() {
  return ext.storage.local.get({ enabled: true, quick: false })
}

/** Asks one port whether Downly is listening there (another program may hold it) */
async function hello(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, { headers: { 'x-downly': '1' }, signal: AbortSignal.timeout(1500) })
    const info = res.ok ? await res.json() : null
    return info?.app === 'Downly' ? info : null
  } catch {
    return null
  }
}

/** Finds the app: the port that worked last time, else every port in the range at once */
async function findApp() {
  const { port } = await ext.storage.local.get({ port: DEFAULT_PORT })
  let info = await hello(port)
  let found = info ? port : null
  if (!found) {
    const answers = await Promise.all(PORTS.filter((p) => p !== port).map(async (p) => [p, await hello(p)]))
    ;[found, info] = answers.find(([, i]) => i) ?? [null, null]
    if (found) await ext.storage.local.set({ port: found })
  }
  appPort = found
  return info
}

/** Cached /ping — tells us the app is alive, where, and which file types it wants */
async function ping(force = false) {
  if (!force && config && Date.now() - configAt < 30_000) return config
  config = await findApp()
  configAt = Date.now()
  return config
}

function request(path, body) {
  return fetch(`http://127.0.0.1:${appPort}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json', 'x-downly': '1' } : { 'x-downly': '1' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000)
  })
}

async function api(path, body) {
  if (!appPort) await ping(true)
  if (!appPort) throw new Error('Downly is not running')
  let res
  try {
    res = await request(path, body)
  } catch (err) {
    // The app may have restarted on another port: look for it once more
    await ping(true)
    if (!appPort) throw err
    res = await request(path, body)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** One piece of a file the page script read out of the page (see sendBlob in content.js) */
async function uploadChunk(id, offset, data) {
  if (!appPort) await ping(true)
  if (!appPort) throw new Error('Downly is not running')
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const res = await fetch(`http://127.0.0.1:${appPort}/upload?id=${encodeURIComponent(id)}&offset=${offset}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-downly': '1' },
    body: bytes,
    signal: AbortSignal.timeout(60_000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function cookiesFor(url) {
  try {
    const list = await ext.cookies.getAll({ url })
    return list.map((c) => `${c.name}=${c.value}`).join('; ')
  } catch {
    return ''
  }
}

async function send(path, payload) {
  const cookies = payload.url ? await cookiesFor(payload.url) : ''
  return api(path, { ...payload, cookies: cookies || undefined, userAgent: navigator.userAgent })
}

// ------------------------------------------------------------ download takeover

function extOf(name) {
  const clean = (name || '').split(/[?#]/)[0]
  const base = clean.split(/[\\/]/).pop()
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const MIME_EXT = {
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'application/x-msdownload': 'exe',
  'application/x-msi': 'msi',
  'application/vnd.android.package-archive': 'apk',
  'application/pdf': 'pdf',
  'application/x-iso9660-image': 'iso',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3'
}

function shouldTake(item, cfg) {
  const url = item.finalUrl || item.url
  if (!/^https?:/i.test(url) || bypass.has(url)) return false
  const { extensions, minSizeKB, skipDomains } = cfg.intercept
  const host = hostOf(url)
  const refHost = hostOf(item.referrer || '')
  if (skipDomains.some((d) => host.endsWith(d) || refHost.endsWith(d))) return false
  const size = item.fileSize > 0 ? item.fileSize : item.totalBytes
  if (minSizeKB && size > 0 && size < minSizeKB * 1024) return false
  const type = extOf(item.filename) || extOf(url) || MIME_EXT[item.mime] || ''
  if (!type) return null // undecided — wait for the filename
  return extensions.includes(type)
}

const pending = new Map()

async function takeOver(item) {
  const url = item.finalUrl || item.url
  try {
    await ext.downloads.cancel(item.id)
    await ext.downloads.erase({ id: item.id })
  } catch {
    /* already finished */
  }
  const name = (item.filename || '').split(/[\\/]/).pop()
  try {
    await send('/download', {
      url,
      fileName: name || undefined,
      size: item.fileSize > 0 ? item.fileSize : undefined,
      referrer: item.referrer || undefined
    })
  } catch {
    // App went away between ping and send — give the download back to the browser
    bypass.add(url)
    ext.downloads.download({ url })
  }
}

ext.downloads.onCreated.addListener(async (item) => {
  const { enabled } = await settings()
  if (!enabled || item.state !== 'in_progress') return
  const cfg = await ping()
  if (!cfg) return
  const decision = shouldTake(item, cfg)
  if (decision === true) return takeOver(item)
  if (decision === null) pending.set(item.id, item)
})

// Chrome often only knows the file name a moment after onCreated
ext.downloads.onChanged.addListener(async (delta) => {
  const item = pending.get(delta.id)
  if (!item) return
  if (delta.filename?.current) item.filename = delta.filename.current
  if (delta.mime?.current) item.mime = delta.mime.current
  if (delta.state?.current && delta.state.current !== 'in_progress') return pending.delete(delta.id)
  const cfg = await ping()
  if (!cfg) return pending.delete(delta.id)
  const decision = shouldTake(item, cfg)
  if (decision === null) return
  pending.delete(delta.id)
  if (decision) takeOver(item)
})

// ------------------------------------------------------------ media sniffing

async function mediaFor(tabId) {
  const key = `media:${tabId}`
  const store = ext.storage.session ?? ext.storage.local
  const data = await store.get(key)
  return { store, key, list: data[key] ?? [] }
}

/** Same file requested in byte ranges (Instagram/Facebook) → one entry */
function mediaId(url) {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return url
  }
}

async function addMedia(tabId, entry) {
  const { store, key, list } = await mediaFor(tabId)
  const id = mediaId(entry.url)
  if (list.some((m) => m.id === id)) return
  // Range pieces (bytestart=…) are separate video-only / audio-only DASH tracks
  entry.part = /[?&](bytestart|byteend|range)=/i.test(entry.url)
  entry.id = id
  entry.kind = /^audio\//.test(entry.type) ? 'audio' : 'video'
  try {
    entry.title = (await ext.tabs.get(tabId)).title
  } catch {
    /* tab closed */
  }
  list.unshift(entry)
  await store.set({ [key]: list.slice(0, 40) })
  ext.action.setBadgeText({ tabId, text: String(Math.min(list.length, 99)) })
  ext.action.setBadgeBackgroundColor({ tabId, color: '#3d63f5' })
}

ext.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.statusCode >= 400) return
    const type = (details.responseHeaders || []).find((h) => h.name.toLowerCase() === 'content-type')?.value || ''
    const length = Number((details.responseHeaders || []).find((h) => h.name.toLowerCase() === 'content-length')?.value || 0)
    const isStream = /mpegurl|dash\+xml/i.test(type) || /\.(m3u8|mpd)(\?|$)/i.test(details.url)
    const isMedia = MEDIA_MIME.test(type) || MEDIA_EXT.test(details.url)
    // Skip tiny chunks of segmented streams; keep playlists and real files
    if (!isStream && (!isMedia || (length > 0 && length < 512 * 1024) || /\.(ts|m4s)(\?|$)/i.test(details.url))) return
    // YouTube serves chunked googlevideo URLs that expire — the page URL is what works
    if (/googlevideo\.com/.test(details.url)) return
    addMedia(details.tabId, { url: details.url, type: type.split(';')[0], size: length || undefined, stream: isStream })
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other', 'object'] },
  ['responseHeaders']
)

ext.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === 'loading' && info.url) {
    const { store, key } = await mediaFor(tabId)
    await store.remove(key)
    ext.action.setBadgeText({ tabId, text: '' })
  }
})
ext.tabs.onRemoved.addListener(async (tabId) => {
  const { store, key } = await mediaFor(tabId)
  store.remove(key)
})

// ------------------------------------------------------------ context menus

async function createMenus() {
  await globalThis.SG_I18N.load()
  ext.contextMenus.removeAll(() => {
    ext.contextMenus.create({ id: 'sg-link', title: t('menuDownloadLink'), contexts: ['link'] })
    ext.contextMenus.create({ id: 'sg-media', title: t('menuDownloadMedia'), contexts: ['video', 'audio', 'image'] })
    ext.contextMenus.create({ id: 'sg-page', title: t('menuDownloadPage'), contexts: ['page'] })
    ext.contextMenus.create({ id: 'sg-all', title: t('menuDownloadAll'), contexts: ['page', 'selection'] })
  })
}
// Say hello to the app right away so its setup screen can show "Connected"
ext.runtime.onInstalled.addListener(() => {
  createMenus()
  ping(true)
})
ext.runtime.onStartup?.addListener(() => {
  createMenus()
  ping(true)
})
ext.storage.onChanged.addListener((changes, area) => area === 'local' && 'lang' in changes && createMenus())

async function collectLinks(tabId) {
  const [res] = await ext.scripting.executeScript({
    target: { tabId },
    func: () => {
      const sel = window.getSelection()
      const root = sel && !sel.isCollapsed ? sel.getRangeAt(0).cloneContents() : document
      const links = [...root.querySelectorAll('a[href]')].map((a) => a.href)
      const media = [...document.querySelectorAll('video[src], audio[src], source[src]')].map((m) => m.src)
      return [...new Set([...links, ...media])].filter((u) => /^https?:/i.test(u))
    }
  })
  return res?.result ?? []
}

ext.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'sg-link') {
      await send('/download', { url: info.linkUrl, referrer: tab?.url, pageUrl: tab?.url })
    } else if (info.menuItemId === 'sg-media') {
      const src = info.srcUrl
      if (src && /^https?:/i.test(src)) await send('/download', { url: src, referrer: tab?.url, pageUrl: tab?.url })
      else await send('/media', { url: tab.url })
    } else if (info.menuItemId === 'sg-page') {
      await send('/media', { url: tab.url })
    } else if (info.menuItemId === 'sg-all') {
      const urls = await collectLinks(tab.id)
      await api('/links', { urls, pageUrl: tab.url })
    }
  } catch {
    notifyDisconnected(tab?.id)
  }
})

ext.commands?.onCommand.addListener(async (command) => {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !/^https?:/.test(tab.url)) return
  const mode = command === 'download-audio' ? 'audio' : 'video'
  try {
    await send('/media', { url: tab.url, mode, quick: (await settings()).quick })
  } catch {
    notifyDisconnected(tab.id)
  }
})

function notifyDisconnected(tabId) {
  if (tabId == null) return
  ext.action.setBadgeText({ tabId, text: '!' })
  ext.action.setBadgeBackgroundColor({ tabId, color: '#e0433a' })
}

// ------------------------------------------------------------ messages (popup & content script)

ext.runtime.onMessage.addListener((msg, sender, reply) => {
  ;(async () => {
    switch (msg.type) {
      case 'status': {
        const [cfg, s] = await Promise.all([ping(true), settings()])
        const { list } = msg.tabId != null ? await mediaFor(msg.tabId) : { list: [] }
        return { connected: !!cfg, version: cfg?.version, enabled: s.enabled, media: list }
      }
      case 'setEnabled':
        await ext.storage.local.set({ enabled: !!msg.enabled })
        return { ok: true }
      case 'media':
        await send('/media', { url: msg.url || sender.tab?.url, mode: msg.mode, quick: msg.quick ?? (await settings()).quick })
        return { ok: true }
      case 'file':
        await send('/download', { url: msg.url, referrer: msg.referrer, pageUrl: msg.referrer })
        return { ok: true }
      case 'upload:chunk':
        return uploadChunk(msg.id, msg.offset, msg.data)
      case 'upload:done':
        return api('/upload/done', { id: msg.id, fileName: msg.fileName, pageUrl: msg.pageUrl })
      case 'links':
        return api('/links', { urls: await collectLinks(msg.tabId), pageUrl: msg.pageUrl })
      default:
        return { ok: false }
    }
  })()
    .then(reply)
    .catch((e) => reply({ ok: false, error: String(e) }))
  return true
})
