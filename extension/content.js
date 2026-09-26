/*
 * Floating download buttons on videos (IDM-style): YouTube, social media (Instagram, Facebook,
 * TikTok, X, Reels/Shorts…) and any page with a <video>. "Download" opens Downly with video
 * selected, ♪ opens it with audio-only selected. The button can be dragged (position saved per
 * site), hidden for the current video with ×, and configured from the popup.
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
  function postUrlFor(video) {
    if (isPostUrl(location.href)) return location.href
    let node = video
    for (let depth = 0; node && depth < 25; depth++, node = node.parentElement) {
      for (const a of node.querySelectorAll?.('a[href]') ?? []) {
        if (isPostUrl(a.href)) return new URL(a.href, location.href).href.split('#')[0]
      }
      if (node.tagName === 'ARTICLE') break
    }
    return location.href
  }

  function videoKey(video) {
    if (isYouTube) {
      const id = new URLSearchParams(location.search).get('v') || location.pathname.split('/shorts/')[1]
      return `yt:${id}`
    }
    return `${postUrlFor(video)}|${video?.currentSrc || video?.src || ''}`
  }

  // ------------------------------------------------------------ button

  function place(wrap) {
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
   * `playlist` (optional) adds a button that sends the whole playlist.
   */
  function makeButton(key, send, playlist) {
    const wrap = document.createElement('div')
    wrap.className = 'downly-wrap'
    const main = button('downly-btn', t('video'), ICON, t('overlay'))
    const audio = button('downly-audio', t('audio'), NOTE)
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
    audio.addEventListener('click', () => feedback(audio, send('audio')))

    let drag = null
    main.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (e.button !== 0) return
      const box = wrap.parentElement.getBoundingClientRect()
      const r = wrap.getBoundingClientRect()
      drag = { sx: e.clientX, sy: e.clientY, ox: r.left - box.left, oy: r.top - box.top, box, moved: false }
      main.setPointerCapture(e.pointerId)
    })
    main.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      if (!drag.moved && Math.hypot(dx, dy) < 5) return
      drag.moved = true
      wrap.classList.add('sg-dragging')
      const maxX = Math.max(1, drag.box.width - wrap.offsetWidth)
      const maxY = Math.max(1, drag.box.height - wrap.offsetHeight)
      drag.x = Math.min(1, Math.max(0, (drag.ox + dx) / maxX))
      drag.y = Math.min(1, Math.max(0, (drag.oy + dy) / maxY))
      wrap.classList.remove('sg-top-left', 'sg-top-right', 'sg-bottom-left', 'sg-bottom-right')
      wrap.classList.add('sg-custom')
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

  const sendMedia = (url, mode) => ext.runtime.sendMessage({ type: 'media', url, mode })

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
    const key = `${videoKey()}|${playlistId() ?? ''}`
    if (existing && (existing.dataset.key !== key || !onWatch)) remove(existing)
    if (!player || !onWatch || dismissed.has(key) || player.querySelector(':scope > .downly-wrap')) return
    // Send the plain video URL: with &list= yt-dlp would treat it as the playlist
    const videoUrl = () => {
      const u = new URL(location.href)
      u.searchParams.delete('list')
      u.searchParams.delete('index')
      return u.href
    }
    const wrap = makeButton(key, (mode) => sendMedia(videoUrl(), mode), playlistId() ? sendPlaylist : null)
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

  const tagged = new WeakMap()
  function tagVideos() {
    for (const video of document.querySelectorAll('video')) {
      const r = video.getBoundingClientRect()
      // Reels/Stories are tall and narrow, so only require a reasonable area
      if (r.width < 160 || r.height < 120) continue
      const key = videoKey(video)
      const old = tagged.get(video)
      // Feeds recycle <video> elements for the next post — refresh the button when it changes
      if (old && old.key === key && old.wrap.isConnected) continue
      if (old) remove(old.wrap)
      const box = video.parentElement
      if (!box || dismissed.has(key)) continue
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative'
      const wrap = makeButton(key, (mode) => {
        const src = video.currentSrc || video.src
        const post = postUrlFor(video)
        // A plain file on a normal site can go straight to the fast engine;
        // social/blob/stream players need the post URL (yt-dlp picks quality & sound)
        if (mode === 'video' && post === location.href && /^https?:/i.test(src) && !/\.m3u8|\.mpd/i.test(src) && !isPostUrl(post)) {
          return ext.runtime.sendMessage({ type: 'file', url: src, referrer: location.href })
        }
        return sendMedia(post, mode)
      })
      box.appendChild(wrap)
      tagged.set(video, { key, wrap })
    }
  }

  function scan() {
    if (!allowed()) {
      for (const w of [...wraps]) remove(w)
      document.getElementById('downly-playlist')?.remove()
      return
    }
    if (isYouTube) youtubeButton()
    else tagVideos()
  }

  function reset() {
    for (const w of [...wraps]) remove(w)
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
    if (allowed()) wraps.forEach(place)
    scan()
  })
  // The popup asks this tab to show again anything dismissed with ×
  ext.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'overlay:restore') {
      dismissed.clear()
      reset()
    }
  })

  let timer = 0
  new MutationObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(scan, 400)
  }).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('yt-navigate-finish', scan)
  // Social feeds swap videos while scrolling without DOM changes big enough to notice
  window.addEventListener('scroll', () => {
    clearTimeout(timer)
    timer = setTimeout(scan, 300)
  }, { passive: true })
})()
