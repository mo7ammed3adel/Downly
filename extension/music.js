/*
 * Music sites (Spotify, Anghami, Deezer, Apple Music, SoundCloud, YouTube Music, Tidal…) have no
 * video to put a button on, so:
 *  - a "Download song" button for whatever is playing, read from the Media Session the site
 *    fills for the system's media controls, so it works the same on every player
 *  - on Spotify, a button on every song row and one for the whole album/playlist
 * A song goes to the app as title + artist and it downloads the matching audio, like Spotify links.
 */
;(() => {
  const MUSIC_SITES =
    /(^|\.)(open\.spotify\.com|anghami\.com|deezer\.com|music\.apple\.com|soundcloud\.com|music\.youtube\.com|tidal\.com|music\.amazon\.[a-z.]+|audiomack\.com|boomplay\.com)$/
  if (!MUSIC_SITES.test(location.hostname) || window.top !== window) return

  const ext = globalThis.browser ?? globalThis.chrome
  const i18n = globalThis.SG_I18N
  const t = (k) => i18n.t(k)
  const isSpotify = location.hostname === 'open.spotify.com'
  const host = location.hostname.replace(/^www\.|^m\./, '')
  const DEFAULTS = { overlay: { enabled: true }, overlayHidden: [] }
  let cfg = DEFAULTS
  const allowed = () => cfg.overlay.enabled && !cfg.overlayHidden.includes(host)

  const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m6 11 6 6 6-6"/><path d="M5 20h14"/></svg>'
  const icon = () => document.importNode(new DOMParser().parseFromString(ICON, 'image/svg+xml').documentElement, true)

  const sendTracks = (tracks, collection) =>
    ext.runtime.sendMessage({ type: 'tracks', tracks, collection, pageUrl: location.href })

  async function feedback(btn, promise) {
    const res = await Promise.resolve(promise).catch(() => ({ ok: false }))
    const cls = res?.ok === false ? 'failed' : 'sent'
    btn.classList.add(cls)
    setTimeout(() => btn.classList.remove(cls), 1800)
  }

  // ------------------------------------------------------------ the song that's playing

  function nowPlaying() {
    const m = navigator.mediaSession?.metadata
    if (!m?.title || !m.artist) return null
    const art = [...(m.artwork || [])].sort((a, b) => parseInt(b.sizes) - parseInt(a.sizes))[0]
    return { title: m.title, artist: m.artist, album: m.album || undefined, cover: art?.src || undefined }
  }

  let pill = null
  function updatePill() {
    const song = allowed() ? nowPlaying() : null
    if (!song) return pill?.remove()
    if (!pill) {
      pill = document.createElement('button')
      pill.id = 'downly-song'
      pill.type = 'button'
      pill.title = t('songBtnTitle')
      pill.append(icon(), document.createElement('span'))
      pill.addEventListener('click', () => pill.song && feedback(pill, sendTracks([pill.song])))
    }
    if (!pill.isConnected) document.body.appendChild(pill)
    pill.song = song
    // Only touch the DOM when the song changes: every change wakes the page observer below
    const label = `${t('songBtn')}: ${song.title} · ${song.artist}`
    if (pill.lastChild.textContent !== label) pill.lastChild.textContent = label
  }

  // ------------------------------------------------------------ Spotify lists

  /** "3:26" → ms */
  const durationMs = (text) => {
    const m = /^(\d+):(\d{2})$/.exec(text.trim())
    return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : undefined
  }

  function rowTrack(row) {
    const link = row.querySelector('a[href*="/track/"]')
    const artists = [...row.querySelectorAll('a[href*="/artist/"]')].map((a) => a.textContent.trim()).filter(Boolean)
    // Album pages list no artist per row: it's the album's artist
    const pageArtist = document.querySelector('[data-testid="creator-link"], a[href*="/artist/"]')?.textContent.trim()
    const title = link?.textContent.trim()
    const artist = artists.length ? [...new Set(artists)].join(', ') : pageArtist
    if (!title || !artist) return null
    const cells = [...row.querySelectorAll('div')].map((d) => d.textContent)
    const duration = cells.map(durationMs).find(Boolean)
    const cover = row.querySelector('img')?.src
    return { title, artist, durationMs: duration, cover }
  }

  function spotifyRows() {
    for (const row of document.querySelectorAll('[data-testid="tracklist-row"]:not([data-downly])')) {
      const link = row.querySelector('a[href*="/track/"]')
      if (!link) continue
      row.dataset.downly = '1'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'downly-row'
      btn.title = t('rowBtn')
      btn.setAttribute('aria-label', t('rowBtn'))
      btn.append(icon())
      for (const type of ['click', 'dblclick', 'mousedown', 'pointerdown']) btn.addEventListener(type, (e) => e.stopPropagation())
      btn.addEventListener('click', () => {
        const track = rowTrack(row)
        if (track) feedback(btn, sendTracks([track]))
      })
      // The last cell lays out its buttons (add, duration, more) in a row: sit with them. Next to
      // the title it would drop onto its own line under the song.
      const cells = row.querySelectorAll('[role="gridcell"]')
      const last = cells[cells.length - 1]
      if (last && cells.length > 1) last.prepend(btn)
      else link.parentElement.append(btn)
    }
  }

  /** Whole album/playlist/track page: the app's Spotify reader lists every song with its details */
  function spotifyPageButton() {
    const existing = document.getElementById('downly-spotify-all')
    const onList = /^\/(intl-[\w-]+\/)?(album|playlist|track)\//.test(location.pathname)
    if (!onList) return existing?.remove()
    const bar = document.querySelector('[data-testid="action-bar-row"]')
    if (!bar || (existing && existing.parentElement === bar && existing.dataset.page === location.pathname)) return
    existing?.remove()
    const btn = document.createElement('button')
    btn.id = 'downly-spotify-all'
    btn.type = 'button'
    btn.dataset.page = location.pathname
    btn.append(icon(), Object.assign(document.createElement('span'), { textContent: location.pathname.includes('/track/') ? t('songBtn') : t('allSongsBtn') }))
    btn.addEventListener('click', () =>
      feedback(btn, ext.runtime.sendMessage({ type: 'media', url: location.origin + location.pathname, mode: 'audio', quick: false }))
    )
    bar.append(btn)
  }

  // ------------------------------------------------------------ keep up with the page

  function scan() {
    if (!allowed()) {
      pill?.remove()
      for (const el of document.querySelectorAll('.downly-row, #downly-spotify-all')) el.remove()
      for (const row of document.querySelectorAll('[data-downly]')) delete row.dataset.downly
      return
    }
    updatePill()
    if (isSpotify) {
      spotifyRows()
      spotifyPageButton()
    }
  }

  Promise.all([ext.storage.local.get(DEFAULTS), i18n.load()]).then(([v]) => {
    cfg = v
    scan()
  })
  ext.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !['overlay', 'overlayHidden', 'lang'].some((k) => k in changes)) return
    if ('lang' in changes) await i18n.load()
    cfg = await ext.storage.local.get(DEFAULTS)
    pill?.remove()
    pill = null
    for (const el of document.querySelectorAll('.downly-row, #downly-spotify-all')) el.remove()
    for (const row of document.querySelectorAll('[data-downly]')) delete row.dataset.downly
    scan()
  })

  let timer = 0
  new MutationObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(scan, 400)
  }).observe(document.documentElement, { childList: true, subtree: true })
  // The playing song changes without the page changing much
  setInterval(updatePill, 1500)
})()
