/*
 * Floating download buttons on videos (IDM-style): YouTube, social media (Instagram, Facebook,
 * TikTok, X, Reels/Shorts…) and any page with a <video>; on story/status pages and WhatsApp Web
 * photos get one too. "Download" opens Downly with video selected, ♪ opens it with audio-only
 * selected. The button can be dragged (position saved per site), hidden for the current video
 * with ×, and configured from the popup.
 *
 * Outside YouTube the buttons live in one layer above the whole page and follow their video on
 * screen, because sites like Instagram cover the video with their own transparent layer.
 */
;(() => {
  const ext = globalThis.browser ?? globalThis.chrome
  const i18n = globalThis.SG_I18N
  const t = (k) => i18n.t(k)
  const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m6 11 6 6 6-6"/><path d="M5 20h14"/></svg>'
  const NOTE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>'
  const LIST =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13"/><path d="M3 12h13"/><path d="M3 18h9"/><path d="m16 16 3 3 3-3"/><path d="M19 12v7"/></svg>'
  const DEFAULTS = { overlay: { enabled: true, corner: 'top-right' }, overlayHidden: [], overlayPos: {} }
  const host = location.hostname.replace(/^www\.|^m\./, '')
  const isYouTube = /(^|\.)youtube\.com$/.test(location.hostname)
  const isWhatsApp = location.hostname === 'web.whatsapp.com'

  let cfg = DEFAULTS
  /** Videos the user dismissed with × (until the page is reloaded) */
  const dismissed = new Set()
  const wraps = new Set()

  const allowed = () => cfg.overlay.enabled && !cfg.overlayHidden.includes(host)

  // ------------------------------------------------------------ which URL belongs to this video

  /** Link patterns that point at a single post/reel on each social site */
  const POST_LINKS = [
    /\/(p|reel|reels|tv)\/[\w-]+/, // instagram
    /\/reel\/\d+|\/videos\/[\w.-]+|\/watch\/?\?v=\d+|\/share\/[rv]\//, // facebook
    /\/@[\w.-]+\/video\/\d+/, // tiktok
    /\/status\/\d+/, // x / twitter
    /\/comments\/\w+/, // reddit
    /\/pin\/\d+/, // pinterest
    /\/shorts\/[\w-]+|\/watch\?v=/ // youtube (feeds)
  ]

  function isPostUrl(url) {
    try {
      const u = new URL(url, location.href)
      return POST_LINKS.some((re) => re.test(u.pathname + u.search))
    } catch {
      return false
    }
  }

  /**
   * On feeds the page URL is the whole timeline, so walk up from the video to the
   * enclosing post and take its permalink. Falls back to the page URL.
   */
  function postUrlFor(media) {
    if (isPostUrl(location.href)) return location.href
    let node = media
    for (let depth = 0; node && depth < 25; depth++, node = node.parentElement) {
      for (const a of node.querySelectorAll?.('a[href]') ?? []) {
        if (isPostUrl(a.href)) return new URL(a.href, location.href).href.split('#')[0]
      }
      if (node.tagName === 'ARTICLE') break
    }
    return location.href
  }

  function mediaKey(media) {
    if (isYouTube && !media) {
      const id = new URLSearchParams(location.search).get('v') || location.pathname.split('/shorts/')[1]
      return `yt:${id}`
    }
    return `${postUrlFor(media)}|${media.currentSrc || media.src || ''}`
  }

  // ------------------------------------------------------------ button

  /** Corner / dragged position, for buttons inside the YouTube player (CSS does the maths) */
  function place(wrap) {
    if (wrap.classList.contains('sg-layer')) return
    const pos = cfg.overlayPos[host]
    wrap.style.setProperty('--sg-w', `${wrap.offsetWidth}px`)
    wrap.style.setProperty('--sg-h', `${wrap.offsetHeight}px`)
    wrap.classList.remove('sg-top-left', 'sg-top-right', 'sg-bottom-left', 'sg-bottom-right', 'sg-custom')
    if (pos) {
      wrap.classList.add('sg-custom')
      wrap.style.setProperty('--sg-x', pos.x)
      wrap.style.setProperty('--sg-y', pos.y)
    } else {
      wrap.classList.add(`sg-${cfg.overlay.corner}`)
    }
  }

  async function feedback(btn, promise) {
    const res = await Promise.resolve(promise).catch(() => ({ ok: false }))
    const cls = res?.ok === false ? 'failed' : 'sent'
    btn.classList.add(cls)
    setTimeout(() => btn.classList.remove(cls), 1800)
  }

  /** Builds a <button> from DOM nodes (no innerHTML, which store reviewers flag) */
  function button(className, title, svg, label) {
    const b = document.createElement('button')
    b.type = 'button'
    if (className) b.className = className
    if (title) b.title = title
    if (title && !label) b.setAttribute('aria-label', title)
    if (svg) b.append(document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true))
    if (label) {
      const span = document.createElement('span')
      span.textContent = label
      b.append(span)
    }
    return b
  }

  /**
   * `send(mode)` delivers the video to the app with 'video' or 'audio' preselected.
   * Options: `playlist` adds a button that sends the whole playlist; `audio: false` drops ♪
   * (photos, WhatsApp files); `box()` is the rectangle the button is dragged within.
   */
  function makeButton(key, send, { playlist = null, audio: withAudio = true, box } = {}) {
    const wrap = document.createElement('div')
    wrap.className = 'downly-wrap'
    const main = button('downly-btn', t('video'), ICON, t('overlay'))
    const audio = withAudio ? button('downly-audio', t('audio'), NOTE) : null
    const list = playlist ? button('downly-audio sg-playlist', t('playlistBtn'), LIST) : null
    const close = button('downly-x', t('hideHere'))
    close.textContent = '×'
    wrap.append(...[main, audio, list, close].filter(Boolean))
    if (list) list.addEventListener('click', () => feedback(list, playlist()))

    // The player reacts to clicks (pause/fullscreen/open post) — keep ours to ourselves
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerup', 'touchstart']) {
      wrap.addEventListener(type, (e) => e.stopPropagation())
    }
    wrap.addEventListener('click', (e) => e.preventDefault())

    close.addEventListener('click', () => {
      dismissed.add(key)
      remove(wrap)
    })
    audio?.addEventListener('click', () => feedback(audio, send('audio')))

    let drag = null
    main.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (e.button !== 0) return
      const area = box ? box() : wrap.parentElement.getBoundingClientRect()
      const r = wrap.getBoundingClientRect()
      drag = { sx: e.clientX, sy: e.clientY, ox: r.left - area.left, oy: r.top - area.top, area, moved: false }
      main.setPointerCapture(e.pointerId)
    })
    main.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      if (!drag.moved && Math.hypot(dx, dy) < 5) return
      drag.moved = true
      wrap.classList.add('sg-dragging')
      const maxX = Math.max(1, drag.area.width - wrap.offsetWidth)
      const maxY = Math.max(1, drag.area.height - wrap.offsetHeight)
      drag.x = Math.min(1, Math.max(0, (drag.ox + dx) / maxX))
      drag.y = Math.min(1, Math.max(0, (drag.oy + dy) / maxY))
      // Layer buttons read this on the next frame; player buttons use the CSS variables
      wrap.sgPos = { x: drag.x, y: drag.y }
      wrap.classList.remove('sg-top-left', 'sg-top-right', 'sg-bottom-left', 'sg-bottom-right')
      if (!wrap.classList.contains('sg-layer')) wrap.classList.add('sg-custom')
      wrap.style.setProperty('--sg-x', drag.x)
      wrap.style.setProperty('--sg-y', drag.y)
    })
    main.addEventListener('pointerup', async () => {
      const d = drag
      drag = null
      wrap.classList.remove('sg-dragging')
      if (!d) return
      if (d.moved) {
        const { overlayPos } = await ext.storage.local.get({ overlayPos: {} })
        overlayPos[host] = { x: +d.x.toFixed(4), y: +d.y.toFixed(4) }
        await ext.storage.local.set({ overlayPos })
        return
      }
      feedback(main, send('video'))
    })

    wraps.add(wrap)
    requestAnimationFrame(() => place(wrap))
    return wrap
  }

  function remove(wrap) {
    wraps.delete(wrap)
    wrap.remove()
  }

  const sendMedia = (url, mode, preferStream = false) => ext.runtime.sendMessage({ type: 'media', url, mode, preferStream })

  /** Sites yt-dlp reads from the page URL; anywhere else the stream the player loads works better */
  const KNOWN_SITES =
    /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|tiktok\.com|twitter\.com|x\.com|reddit\.com|vimeo\.com|dailymotion\.com|twitch\.tv|pinterest\.com|snapchat\.com|linkedin\.com|soundcloud\.com|bilibili\.com)$/
  const knownSite = () => KNOWN_SITES.test(location.hostname)
  const sendFile = (url) => ext.runtime.sendMessage({ type: 'file', url, referrer: location.href })

  // ------------------------------------------------------------ media that only exists in the page

  const CHUNK = 4 * 1024 * 1024
  // Firefox content scripts fetch as the extension; content.fetch reads the page's blob: URLs
  const pageFetch = typeof content !== 'undefined' && content?.fetch ? content.fetch.bind(content) : fetch

  const base64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

  function fileNameFor(media, blob) {
    const type = (blob.type.split('/')[1] || '').split(';')[0]
    const extension = { jpeg: 'jpg', quicktime: 'mov', 'x-matroska': 'mkv' }[type] ?? (type || (media?.tagName === 'IMG' ? 'jpg' : media ? 'mp4' : 'bin'))
    const site = isWhatsApp ? 'WhatsApp' : host.split('.')[0]
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    return `${site}-${stamp}.${extension}`
  }

  /**
   * blob: media (WhatsApp decrypts its files inside the page) can't be fetched by the app, so
   * read it here and pass it over in pieces. Streaming players' blob: URLs can't be read at all:
   * returns null for those so the caller falls back to the post URL.
   */
  async function sendBlob(media, src, fileName) {
    let blob
    try {
      blob = await (await pageFetch(src)).blob()
    } catch {
      return null
    }
    if (!blob.size) return null
    const id = crypto.randomUUID()
    for (let offset = 0; offset < blob.size; offset += CHUNK) {
      const data = await base64(blob.slice(offset, offset + CHUNK))
      const res = await ext.runtime.sendMessage({ type: 'upload:chunk', id, offset, data })
      if (!res?.ok) return { ok: false }
    }
    return ext.runtime.sendMessage({ type: 'upload:done', id, fileName: fileName || fileNameFor(media, blob), pageUrl: location.href })
  }

  // ------------------------------------------------------------ placement per site

  const playlistId = () => new URLSearchParams(location.search).get('list')
  /** Opens the app's playlist picker (all videos with checkboxes) — never quick mode */
  const sendPlaylist = () =>
    ext.runtime.sendMessage({ type: 'media', url: `https://www.youtube.com/playlist?list=${playlistId()}`, quick: false })

  function youtubeButton() {
    playlistPageButton()
    const player = document.querySelector('#movie_player')
    const onWatch = location.pathname === '/watch' || location.pathname.startsWith('/shorts/')
    const existing = player?.querySelector(':scope > .downly-wrap')
    // Include the playlist in the key so the ☰ button appears/disappears with it
    const key = `${mediaKey()}|${playlistId() ?? ''}`
    if (existing && (existing.dataset.key !== key || !onWatch)) remove(existing)
    if (!player || !onWatch || dismissed.has(key) || player.querySelector(':scope > .downly-wrap')) return
    // Send the plain video URL: with &list= yt-dlp would treat it as the playlist
    const videoUrl = () => {
      const u = new URL(location.href)
      u.searchParams.delete('list')
      u.searchParams.delete('index')
      return u.href
    }
    const wrap = makeButton(key, (mode) => sendMedia(videoUrl(), mode), { playlist: playlistId() ? sendPlaylist : null })
    wrap.dataset.key = key
    player.appendChild(wrap)
  }

  /** Fixed "Download playlist" button on youtube.com/playlist pages */
  function playlistPageButton() {
    const existing = document.getElementById('downly-playlist')
    const onPlaylist = location.pathname === '/playlist' && playlistId()
    if (!onPlaylist || !allowed()) return existing?.remove()
    if (existing) return
    const btn = button(null, null, LIST, t('playlistBtn'))
    btn.id = 'downly-playlist'
    btn.addEventListener('click', () => feedback(btn, sendPlaylist()))
    document.body.appendChild(btn)
  }

  /** Story/status pages, where photos get a button too, not only videos */
  const photoPage = () => isWhatsApp || /(^|\.)snapchat\.com$/.test(location.hostname) || /\/stories\//.test(location.pathname)
  const MIN_SIZE = { VIDEO: [160, 120], IMG: [200, 140] }

  /** WhatsApp shows a chat video as a picture with a play icon: that picture isn't the video */
  function isVideoPreview(img) {
    let node = img
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      if (node.querySelector?.('[data-icon*="play"], [data-icon*="gif"]')) return true
    }
    return false
  }

  function wanted(media) {
    const [w, h] = MIN_SIZE[media.tagName]
    const r = media.getBoundingClientRect()
    if (r.width < w || r.height < h) return false
    if (media.tagName === 'IMG') return !!media.currentSrc && !(isWhatsApp && isVideoPreview(media))
    return true
  }

  async function download(media, mode) {
    const src = media.currentSrc || media.src || ''
    const post = postUrlFor(media)
    if (src.startsWith('blob:')) return (await sendBlob(media, src)) ?? sendMedia(post, mode, !knownSite())
    if (media.tagName === 'IMG') return sendFile(src)
    // A plain file goes straight to the fast engine: on normal sites, and on story pages where
    // the file is exactly the story on screen. Feeds/streams need the post URL (yt-dlp).
    const plainFile = /^https?:/i.test(src) && !/\.m3u8|\.mpd/i.test(src)
    if (mode === 'video' && plainFile && (photoPage() || (post === location.href && !isPostUrl(post)))) return sendFile(src)
    return sendMedia(post, mode, !knownSite())
  }

  // Every other site: one layer above the page, each button following its video
  let layer = null
  function layerRoot() {
    layer ??= Object.assign(document.createElement('div'), { id: 'downly-layer' })
    // In fullscreen only the fullscreen element is drawn, so the layer moves inside it
    const full = document.fullscreenElement
    const parent = full && full.tagName !== 'VIDEO' ? full : document.documentElement
    if (layer.parentNode !== parent) parent.appendChild(layer)
    return layer
  }

  /** media element → { key, wrap } */
  const tracked = new Map()
  let pointer = { x: -1, y: -1 }
  addEventListener('pointermove', (e) => (pointer = { x: e.clientX, y: e.clientY }), { capture: true, passive: true })

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))

  function follow(wrap, media) {
    const r = media.getBoundingClientRect()
    const onScreen = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
    const shown = onScreen && (media.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true)
    wrap.classList.toggle('sg-off', !shown)
    if (!shown) return
    const w = wrap.offsetWidth
    const h = wrap.offsetHeight
    const pos = wrap.sgPos ?? cfg.overlayPos[host]
    let x, y
    if (pos) {
      x = r.left + (r.width - w) * pos.x
      y = r.top + (r.height - h) * pos.y
    } else {
      const [v, side] = cfg.overlay.corner.split('-')
      x = side === 'left' ? r.left + 12 : r.right - w - 12
      y = v === 'top' ? r.top + 12 : r.bottom - h - 64
    }
    // Stay on the visible part of the video (reels and stories are often taller than the window)
    x = clamp(x, Math.max(r.left, 0) + 4, Math.min(r.right, innerWidth) - w - 4)
    y = clamp(y, Math.max(r.top, 0) + 4, Math.min(r.bottom, innerHeight) - h - 4)
    wrap.style.left = `${x}px`
    wrap.style.top = `${y}px`
    const over = pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom
    wrap.classList.toggle('sg-show', over)
  }

  let frame = 0
  function tick() {
    frame = 0
    if (!tracked.size) return
    layerRoot()
    for (const [media, item] of tracked) {
      if (!media.isConnected || !item.wrap.isConnected) {
        remove(item.wrap)
        tracked.delete(media)
      } else follow(item.wrap, media)
    }
    frame = requestAnimationFrame(tick)
  }

  function tagMedia() {
    const found = [...document.querySelectorAll('video')]
    if (photoPage()) found.push(...document.querySelectorAll('img'))
    for (const media of found) {
      const old = tracked.get(media)
      if (!wanted(media)) {
        if (old) {
          remove(old.wrap)
          tracked.delete(media)
        }
        continue
      }
      const key = mediaKey(media)
      // Feeds recycle <video> elements for the next post — refresh the button when it changes
      if (old && old.key === key && old.wrap.isConnected) continue
      if (old) remove(old.wrap)
      tracked.delete(media)
      if (dismissed.has(key)) continue
      const wrap = makeButton(key, (mode) => download(media, mode), {
        audio: media.tagName === 'VIDEO' && !isWhatsApp,
        box: () => media.getBoundingClientRect()
      })
      wrap.classList.add('sg-layer')
      layerRoot().appendChild(wrap)
      tracked.set(media, { key, wrap })
    }
    if (tracked.size && !frame) frame = requestAnimationFrame(tick)
  }

  function scan() {
    if (!allowed()) {
      for (const w of [...wraps]) remove(w)
      tracked.clear()
      document.getElementById('downly-playlist')?.remove()
      return
    }
    // Embedded YouTube players have no watch page around them: treat them like any video
    if (isYouTube && !location.pathname.startsWith('/embed/')) youtubeButton()
    else tagMedia()
  }

  function reset() {
    for (const w of [...wraps]) remove(w)
    tracked.clear()
    document.getElementById('downly-playlist')?.remove()
    scan()
  }

  Promise.all([ext.storage.local.get(DEFAULTS), i18n.load()]).then(([v]) => {
    cfg = v
    scan()
  })
  ext.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return
    if ('lang' in changes) {
      await i18n.load()
      return reset()
    }
    if (!['overlay', 'overlayHidden', 'overlayPos'].some((k) => k in changes)) return
    cfg = await ext.storage.local.get(DEFAULTS)
    for (const w of wraps) delete w.sgPos
    if (allowed()) wraps.forEach(place)
    scan()
  })
  // The popup asks this tab to show again anything dismissed with ×
  ext.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'overlay:restore') {
      dismissed.clear()
      reset()
    }
    // A blob: download this page made (MEGA etc.): hand the file to the app
    if (msg?.type === 'upload-blob') {
      sendBlob(null, msg.url, msg.fileName)
        .then((res) => reply({ ok: !!res && res.ok !== false }))
        .catch(() => reply({ ok: false }))
      return true
    }
  })

  let timer = 0
  new MutationObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(scan, 400)
  }).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('yt-navigate-finish', scan)
  document.addEventListener('fullscreenchange', () => tracked.size && layerRoot())
  // Social feeds swap videos while scrolling without DOM changes big enough to notice
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(timer)
      timer = setTimeout(scan, 300)
    },
    { passive: true }
  )
})()
