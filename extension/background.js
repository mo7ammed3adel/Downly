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
  syncDownloadUi()
  if (config) reloadIfOutdated(config.version)
  return config
}

// ------------------------------------------------------------ staying current
// The app ships this extension and refreshes its folder when it updates, but a browser keeps
// running a folder-loaded extension's old code until it's reloaded. Seeing a newer app, reload
// once so the browser picks up the new files (once per version, in case the files didn't change).
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => String(v).split('.').map(Number))
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

async function reloadIfOutdated(appVersion) {
  if (!appVersion || !newer(appVersion, ext.runtime.getManifest().version)) return
  const { reloadedFor } = await ext.storage.local.get({ reloadedFor: '' })
  if (reloadedFor === appVersion) return
  await ext.storage.local.set({ reloadedFor: appVersion })
  ext.runtime.reload()
}

// ------------------------------------------------------------ browser download bubble
// The browser only tells us about a download once it has started, so its download bubble
// would flash before Downly shows up. While the app is running the bubble stays hidden
// (Chrome/Edge; Firefox has no such option); downloads we leave to the browser bring it back.
const canHideUi = typeof ext.downloads.setUiOptions === 'function'
/** Downloads left to the browser that are still running */
const givenBack = new Set()
let uiHidden = null

async function syncDownloadUi() {
  if (!canHideUi) return
  const { enabled } = await settings()
  const hide = enabled && !!config && givenBack.size === 0
  if (hide === uiHidden) return
  uiHidden = hide
  await ext.downloads.setUiOptions({ enabled: !hide }).catch(() => (uiHidden = null))
}

function giveBack(id) {
  givenBack.add(id)
  syncDownloadUi()
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
  const cookies = payload.cookies || (payload.url ? await cookiesFor(payload.url) : '')
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

/** Downloads the page started with a form POST: the app can't repeat those, the browser keeps them */
const postedUrls = new Set()
ext.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === 'GET') return
    postedUrls.add(details.url)
    if (postedUrls.size > 200) postedUrls.delete(postedUrls.values().next().value)
  },
  { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame'] }
)

function shouldTake(item, cfg) {
  const url = item.finalUrl || item.url
  if (bypass.has(url) || postedUrls.has(url) || postedUrls.has(item.url)) return false
  // Files the page built itself (MEGA decrypts in the page, exports, generated zips)
  if (/^blob:/i.test(url)) return cfg.intercept.all !== false
  if (!/^https?:/i.test(url)) return false
  const { extensions, minSizeKB, skipDomains } = cfg.intercept
  const host = hostOf(url)
  const refHost = hostOf(item.referrer || '')
  if (skipDomains.some((d) => host.endsWith(d) || refHost.endsWith(d))) return false
  const size = item.fileSize > 0 ? item.fileSize : item.totalBytes
  if (minSizeKB && size > 0 && size < minSizeKB * 1024) return false
  const type = extOf(item.filename) || extOf(url) || MIME_EXT[item.mime] || ''
  // Every file (older apps don't send `all`): web pages saved with Ctrl+S stay in the browser
  if (cfg.intercept.all !== false) return !/^html?$/.test(type) && item.mime !== 'text/html'
  if (!type) return null // undecided — wait for the filename
  return extensions.includes(type)
}

const pending = new Map()

/**
 * The browser's copy is paused, not cancelled, until the app confirms it can get the file
 * itself: single-use links, sessions it can't repeat or pages only the browser can read would
 * otherwise be lost. If the app can't, the browser simply carries on.
 */
async function takeOver(item) {
  const url = item.finalUrl || item.url
  const name = (item.filename || '').split(/[\\/]/).pop()
  await ext.downloads.pause(item.id).catch(() => {})
  let taken = false
  try {
    if (/^blob:/i.test(url)) {
      taken = await takeBlob(url, name, item.referrer)
    } else {
      const request = requestContext(sentByUrl.get(url) ?? sentByUrl.get(item.url))
      const res = await send('/download', {
        url,
        fileName: name || undefined,
        size: item.fileSize > 0 ? item.fileSize : undefined,
        ...request,
        referrer: item.referrer || request.referrer,
        verify: true
      })
      taken = res?.ok !== false
    }
  } catch {
    taken = false // app went away
  }
  if (taken) {
    await ext.downloads.cancel(item.id).catch(() => {})
    await ext.downloads.erase({ id: item.id }).catch(() => {})
  } else {
    bypass.add(url)
    await ext.downloads.resume(item.id).catch(() => {})
    giveBack(item.id)
  }
}

/**
 * A blob: download exists only in the page that made it: ask that page (its content script
 * reads the file and sends it to the app in pieces, like WhatsApp media).
 */
async function takeBlob(url, fileName, referrer) {
  const origin = new URL(url.slice(5)).origin
  const tabs = (await ext.tabs.query({})).filter((t) => t.url?.startsWith(origin))
  tabs.sort((a, b) => (b.url === referrer) - (a.url === referrer) || b.active - a.active)
  for (const tab of tabs) {
    const res = await ext.tabs.sendMessage(tab.id, { type: 'upload-blob', url, fileName }, { frameId: 0 }).catch(() => null)
    if (res?.ok) return true
  }
  return false
}

// Chrome/Edge/Brave ask extensions for the file name before showing "Save as" (when the user
// has "Ask where to save each file" on) or writing anything, so taking the download at that
// point means the browser's own prompt never appears. Firefox has no such step: onCreated below.
const canDecideEarly = !!ext.downloads.onDeterminingFilename

async function wantsDownload(item) {
  const { enabled } = await settings()
  if (!enabled) return false
  const cfg = await ping()
  return !!cfg && shouldTake(item, cfg) === true
}

if (canDecideEarly) {
  ext.downloads.onDeterminingFilename.addListener((item, suggest) => {
    wantsDownload(item)
      .then(async (take) => {
        if (take) await takeOver(item)
        else giveBack(item.id)
      })
      .catch(() => giveBack(item.id))
      .finally(() => suggest())
    return true // answering asynchronously
  })
}

ext.downloads.onCreated.addListener(async (item) => {
  if (canDecideEarly) return
  const { enabled } = await settings()
  if (!enabled || item.state !== 'in_progress') return
  const cfg = await ping()
  if (!cfg) return
  const decision = shouldTake(item, cfg)
  if (decision === true) return takeOver(item)
  if (decision === null) pending.set(item.id, item)
  else giveBack(item.id)
})

// Chrome often only knows the file name a moment after onCreated
ext.downloads.onChanged.addListener(async (delta) => {
  if (givenBack.has(delta.id) && delta.state && delta.state.current !== 'in_progress') {
    givenBack.delete(delta.id)
    syncDownloadUi()
  }
  const item = pending.get(delta.id)
  if (!item) return
  if (delta.filename?.current) item.filename = delta.filename.current
  if (delta.mime?.current) item.mime = delta.mime.current
  if (delta.state?.current && delta.state.current !== 'in_progress') return pending.delete(delta.id)
  const cfg = await ping()
  if (!cfg) {
    pending.delete(delta.id)
    return giveBack(delta.id)
  }
  const decision = shouldTake(item, cfg)
  if (decision === null) return
  pending.delete(delta.id)
  if (decision) takeOver(item)
  else giveBack(delta.id)
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

/**
 * A tab's list is read and rewritten by several events at once (files arriving, the page
 * navigating); running them one after another keeps one from overwriting the other.
 */
const tabQueues = new Map()
function inOrder(tabId, job) {
  const next = (tabQueues.get(tabId) ?? Promise.resolve()).then(job, job)
  tabQueues.set(tabId, next.catch(() => {}))
  return next
}

const addMedia = (tabId, entry) => inOrder(tabId, () => recordMedia(tabId, entry))

async function recordMedia(tabId, entry) {
  const { store, key, list } = await mediaFor(tabId)
  const id = mediaId(entry.url)
  if (list.some((m) => m.id === id)) return
  // Range pieces (bytestart=…) are separate video-only / audio-only DASH tracks
  entry.part = /[?&](bytestart|byteend|range)=/i.test(entry.url)
  entry.id = id
  entry.kind = /^audio\//.test(entry.type) ? 'audio' : 'video'
  entry.at = Date.now()
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

// How the page asked for each file: guarded sites (hotlink checks, session cookies, token
// headers) only answer the app if it asks the same way, which is what makes those sites work.
const requestHeaders = new Map()
const sentByUrl = new Map()
const EXTRA_HEADERS = ext.webRequest.OnSendHeadersOptions?.EXTRA_HEADERS // Chrome: needed to see Cookie/Referer
const KEPT_HEADERS = /^(referer|cookie|origin|authorization|x-[\w-]+)$/i

ext.webRequest.onSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0) return
    const kept = {}
    for (const h of details.requestHeaders || []) if (KEPT_HEADERS.test(h.name) && h.value) kept[h.name.toLowerCase()] = h.value
    // Downloads start as page/frame navigations (or 'other' for <a download>): remember them by
    // URL, so a download Downly takes over is requested exactly like the browser did after the
    // site's scripts (countdowns, generated links) ran
    if (details.type !== 'media' && details.type !== 'xmlhttprequest' && details.type !== 'object') {
      sentByUrl.set(details.url, kept)
      if (sentByUrl.size > 100) sentByUrl.delete(sentByUrl.keys().next().value)
    }
    if (details.type === 'main_frame' || details.type === 'sub_frame') return
    requestHeaders.set(details.requestId, kept)
    // Requests whose response never comes would pile up
    if (requestHeaders.size > 500) requestHeaders.delete(requestHeaders.keys().next().value)
  },
  { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame', 'media', 'xmlhttprequest', 'other', 'object'] },
  EXTRA_HEADERS ? ['requestHeaders', EXTRA_HEADERS] : ['requestHeaders']
)
ext.webRequest.onErrorOccurred.addListener((details) => requestHeaders.delete(details.requestId), { urls: ['<all_urls>'] })

/** Splits what the page sent into the fields the app takes */
function requestContext(headers = {}) {
  const { referer, cookie, ...rest } = headers
  return { referrer: referer, cookies: cookie, headers: Object.keys(rest).length ? rest : undefined }
}

ext.webRequest.onHeadersReceived.addListener(
  (details) => {
    const sent = requestHeaders.get(details.requestId)
    requestHeaders.delete(details.requestId)
    if (details.tabId < 0 || details.statusCode >= 400) return
    const type = (details.responseHeaders || []).find((h) => h.name.toLowerCase() === 'content-type')?.value || ''
    const length = Number((details.responseHeaders || []).find((h) => h.name.toLowerCase() === 'content-length')?.value || 0)
    const isStream = /mpegurl|dash\+xml/i.test(type) || /\.(m3u8|mpd)(\?|$)/i.test(details.url)
    const isMedia = MEDIA_MIME.test(type) || MEDIA_EXT.test(details.url)
    // Skip tiny chunks of segmented streams; keep playlists and real files
    if (!isStream && (!isMedia || (length > 0 && length < 512 * 1024) || /\.(ts|m4s)(\?|$)/i.test(details.url))) return
    // YouTube serves chunked googlevideo URLs that expire — the page URL is what works
    if (/googlevideo\.com/.test(details.url)) return
    addMedia(details.tabId, { url: details.url, type: type.split(';')[0], size: length || undefined, stream: isStream, request: requestContext(sent) })
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other', 'object'] },
  ['responseHeaders']
)

/**
 * What a video player on this tab is actually playing: the newest stream playlist
 * (HLS/DASH), else the newest whole video file. Split video-only/audio-only tracks are
 * skipped, those need the page. Used when the page itself isn't something yt-dlp knows.
 */
async function playingStream(tabId) {
  const { list } = await mediaFor(tabId)
  return list.find((m) => m.stream && !m.part) ?? list.find((m) => !m.part && m.kind === 'video') ?? null
}

ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'loading' || !info.url) return
  // The new page's first files can be reported just before this event: keep the last moment's
  const since = Date.now() - 500
  inOrder(tabId, async () => {
    const { store, key, list } = await mediaFor(tabId)
    const kept = list.filter((m) => m.at >= since)
    await (kept.length ? store.set({ [key]: kept }) : store.remove(key))
    ext.action.setBadgeText({ tabId, text: kept.length ? String(kept.length) : '' })
  })
})
ext.tabs.onRemoved.addListener((tabId) =>
  inOrder(tabId, async () => {
    const { store, key } = await mediaFor(tabId)
    await store.remove(key)
    tabQueues.delete(tabId)
  })
)

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
        await syncDownloadUi()
        return { ok: true }
      case 'media': {
        const quick = msg.quick ?? (await settings()).quick
        const pageUrl = sender.tab?.url ?? msg.pageUrl
        const stream = msg.preferStream && sender.tab ? await playingStream(sender.tab.id) : null
        if (stream?.stream) {
          await send('/media', { url: stream.url, mode: msg.mode, quick, pageUrl, ...stream.request, referrer: stream.request?.referrer || pageUrl })
        } else if (stream) {
          await send('/download', { url: stream.url, pageUrl, ...stream.request, referrer: stream.request?.referrer || pageUrl })
        } else {
          await send('/media', { url: msg.url || sender.tab?.url, mode: msg.mode, quick, referrer: msg.referrer, headers: msg.headers, cookies: msg.cookies })
        }
        return { ok: true }
      }
      case 'file':
        await send('/download', { url: msg.url, referrer: msg.referrer, pageUrl: msg.pageUrl ?? msg.referrer, headers: msg.headers, cookies: msg.cookies })
        return { ok: true }
      case 'upload:chunk':
        return uploadChunk(msg.id, msg.offset, msg.data)
      case 'upload:done':
        return api('/upload/done', { id: msg.id, fileName: msg.fileName, pageUrl: msg.pageUrl })
      case 'tracks':
        // Songs read off a music site: the app downloads the matching audio for each
        await api('/media', { url: msg.pageUrl || sender.tab?.url, tracks: msg.tracks, collection: msg.collection })
        return { ok: true }
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
