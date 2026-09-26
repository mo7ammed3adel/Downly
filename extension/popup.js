const ext = globalThis.browser ?? globalThis.chrome
const i18n = globalThis.SG_I18N
const $ = (id) => document.getElementById(id)
const msg = (key) => i18n.t(key)

function applyStrings() {
  document.documentElement.dir = i18n.rtl ? 'rtl' : 'ltr'
  document.documentElement.lang = i18n.lang
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = msg(el.dataset.i18n)
}

function formatSize(bytes) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`
}

/** CDN names like "AQMs1yKf…mp4" mean nothing — name entries after the page instead */
function entryLabel(m, index) {
  let file = ''
  try {
    file = decodeURIComponent(new URL(m.url).pathname.split('/').pop() || '')
  } catch {
    /* keep empty */
  }
  const readable = file && file.length <= 40 && !/^[A-Za-z0-9_-]{25,}/.test(file) && /[a-z]{3}/i.test(file)
  if (readable) return file
  const kind = m.stream ? msg('stream') : m.kind === 'audio' ? msg('audio') : msg('video')
  const title = (m.title || '').replace(/\s*[|•–-]\s*[^|•–-]*$/, '').trim()
  return `${kind} ${index + 1}${title ? ` — ${title}` : ''}`
}

function flash(btn, text = msg('sent')) {
  const old = btn.textContent
  btn.textContent = `✓ ${text}`
  btn.disabled = true
  setTimeout(() => {
    btn.textContent = old
    btn.disabled = false
  }, 1500)
}

async function init() {
  await i18n.load()
  applyStrings()
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  const state = await ext.runtime.sendMessage({ type: 'status', tabId: tab?.id })

  const status = $('status')
  status.textContent = state.connected ? `${msg('connected')}${state.version ? ` · v${state.version}` : ''}` : msg('disconnected')
  status.className = `status ${state.connected ? 'ok' : 'bad'}`
  $('offline').hidden = state.connected
  $('enabled').checked = state.enabled
  $('enabled').onchange = (e) => ext.runtime.sendMessage({ type: 'setEnabled', enabled: e.target.checked })

  const { lang, quick } = await ext.storage.local.get({ lang: 'auto', quick: false })
  $('quick').checked = quick
  $('quick').onchange = (e) => ext.storage.local.set({ quick: e.target.checked })
  $('lang').value = lang
  $('lang').onchange = async (e) => {
    await ext.storage.local.set({ lang: e.target.value })
    location.reload()
  }

  const canUse = state.connected && /^https?:/.test(tab?.url ?? '')
  $('page').disabled = !canUse
  $('links').disabled = !canUse

  const run = async (message, close = true) => {
    const res = await ext.runtime.sendMessage(message)
    if (res?.ok === false) {
      $('error').textContent = `${msg('sendFailed')} ${res.error ?? ''}`
      $('error').hidden = false
      return false
    }
    if (close) window.close()
    return true
  }
  $('page').onclick = () => run({ type: 'media', url: tab.url })
  $('links').onclick = () => run({ type: 'links', tabId: tab.id, pageUrl: tab.url })

  // ---- files seen on this page
  const list = $('media')
  const media = state.media
  $('none').hidden = media.length > 0
  // Separate video/audio tracks: downloading one gives a file without sound
  $('streams').hidden = !media.some((m) => m.part)
  media.forEach((m, i) => {
    const li = document.createElement('li')
    const name = document.createElement('span')
    name.className = 'name'
    name.title = m.url
    name.textContent = entryLabel(m, i)
    const meta = document.createElement('span')
    meta.className = 'type'
    meta.textContent = [m.stream ? 'HLS/DASH' : (m.type || '').split('/')[1], formatSize(m.size)].filter(Boolean).join(' · ')
    const btn = document.createElement('button')
    btn.textContent = msg('download')
    btn.disabled = !state.connected
    btn.onclick = async () => {
      // Streams and split tracks need the page (yt-dlp merges video + sound); plain files go direct
      // The page's own request details (Referer, cookies, tokens) let guarded sites answer the app
      const request = m.request ?? {}
      const ok =
        m.part
          ? await run({ type: 'media', url: tab.url }, false)
          : m.stream
            ? await run({ type: 'media', url: m.url, ...request, referrer: request.referrer || tab.url }, false)
            : await run({ type: 'file', url: m.url, pageUrl: tab.url, ...request, referrer: request.referrer || tab.url }, false)
      if (ok) flash(btn)
    }
    li.append(name, meta, btn)
    list.append(li)
  })

  // ---- download button on videos
  let host = ''
  try {
    host = new URL(tab.url).hostname.replace(/^www\.|^m\./, '')
  } catch {
    /* chrome:// pages etc. */
  }
  const ov = await ext.storage.local.get({ overlay: { enabled: true, corner: 'top-right' }, overlayHidden: [], overlayPos: {} })
  $('ovEnabled').checked = ov.overlay.enabled
  $('ovCorner').value = ov.overlay.corner
  $('ovSiteLabel').textContent = host ? `${msg('overlaySite')} ${host}` : msg('overlaySite')
  $('ovSite').checked = ov.overlayHidden.includes(host)
  $('ovSite').disabled = !host
  const saveOverlay = () => ext.storage.local.set({ overlay: { enabled: $('ovEnabled').checked, corner: $('ovCorner').value } })
  const clearPos = async () => {
    const { overlayPos } = await ext.storage.local.get({ overlayPos: {} })
    delete overlayPos[host]
    await ext.storage.local.set({ overlayPos })
  }
  $('ovEnabled').onchange = saveOverlay
  $('ovCorner').onchange = async () => {
    // Picking a corner replaces a dragged position on this site
    await clearPos()
    await saveOverlay()
  }
  $('ovSite').onchange = async (e) => {
    const { overlayHidden } = await ext.storage.local.get({ overlayHidden: [] })
    const next = overlayHidden.filter((h) => h !== host)
    if (e.target.checked) next.push(host)
    await ext.storage.local.set({ overlayHidden: next })
  }
  $('ovReset').onclick = async () => {
    await clearPos()
    flash($('ovReset'), msg('doneLabel'))
  }
  $('ovRestore').onclick = async () => {
    await ext.tabs.sendMessage(tab.id, { type: 'overlay:restore' }).catch(() => {})
    flash($('ovRestore'), msg('doneLabel'))
  }
}

init()
