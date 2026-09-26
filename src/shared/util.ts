import type { Category, CategoryConfig, MediaMode } from './types'

/** Which folder/category a media job lands in */
export function mediaCategory(mode: MediaMode | undefined): Category {
  switch (mode) {
    case 'audio':
      return 'music'
    case 'thumbnail':
      return 'images'
    case 'subtitles':
      return 'documents'
    default:
      return 'video'
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  let i = 0
  let v = bytes
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${UNITS[i]}`
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  sec = Math.round(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function extensionOf(fileName: string): string {
  const clean = fileName.split(/[?#]/)[0]
  const dot = clean.lastIndexOf('.')
  if (dot <= 0 || dot === clean.length - 1) return ''
  return clean.slice(dot + 1).toLowerCase()
}

export function categorize(fileName: string, categories: Record<Category, CategoryConfig>): Category {
  const ext = extensionOf(fileName)
  if (!ext) return 'other'
  for (const [cat, cfg] of Object.entries(categories) as [Category, CategoryConfig][]) {
    if (cfg.extensions.includes(ext)) return cat
  }
  return 'other'
}

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

export function sanitizeFileName(name: string): string {
  let out = name.replace(ILLEGAL, '_').replace(/[. ]+$/, '').trim()
  if (RESERVED.test(out)) out = `_${out}`
  if (out.length > 200) {
    const ext = extensionOf(out)
    out = out.slice(0, 200 - ext.length - 1) + (ext ? `.${ext}` : '')
  }
  return out || 'download'
}

const SPOTIFY_RE = /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]+\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/

export function parseSpotifyUrl(url: string): { type: 'track' | 'album' | 'playlist' | 'artist'; id: string } | null {
  const m = SPOTIFY_RE.exec(url.trim())
  return m ? { type: m[3] as 'track', id: m[4] } : null
}

/** Sites that are always handed to yt-dlp instead of the plain HTTP engine */
const MEDIA_HOSTS = [
  'youtube.com', 'youtu.be', 'music.youtube.com', 'vimeo.com', 'dailymotion.com', 'facebook.com', 'fb.watch',
  'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'soundcloud.com', 'twitch.tv', 'reddit.com',
  'bilibili.com', 'vk.com', 'ok.ru', 'rumble.com', 'bandcamp.com', 'mixcloud.com', 'pinterest.com',
  'linkedin.com', 'threads.net', 'kick.com', 'streamable.com', 'ted.com', 'nicovideo.jp', 'aparat.com',
  'deezer.com', 'snapchat.com', 'tumblr.com', 'imdb.com', 'bbc.co.uk', 'cnn.com', 'arte.tv', 'weibo.com'
]

export function isKnownMediaSite(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, '')
    return MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Expands batch patterns like `https://x.com/file[001-120].zip` or `img[a-f].png`
 * into individual URLs (IDM "batch download" feature).
 */
export function expandBatchPattern(pattern: string, limit = 5000): string[] {
  const m = /\[(\d+)-(\d+)\]|\[([a-z])-([a-z])\]/i.exec(pattern)
  if (!m) return [pattern]
  const out: string[] = []
  const before = pattern.slice(0, m.index)
  const after = pattern.slice(m.index + m[0].length)
  if (m[1] !== undefined) {
    const width = m[1].length === m[2].length ? m[1].length : 0
    const from = parseInt(m[1], 10)
    const to = parseInt(m[2], 10)
    const step = from <= to ? 1 : -1
    for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
      out.push(...expandBatchPattern(before + String(i).padStart(width, '0') + after, limit))
      if (out.length >= limit) break
    }
  } else {
    const from = m[3].charCodeAt(0)
    const to = m[4].charCodeAt(0)
    for (let c = from; c <= to; c++) out.push(...expandBatchPattern(before + String.fromCharCode(c) + after, limit))
  }
  return out.slice(0, limit)
}

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(text.trim())
}
