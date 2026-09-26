export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'paused'
  | 'completed'
  | 'error'

/** http = direct file, media = yt-dlp site (YouTube...), spotify = metadata from Spotify, audio matched on YouTube */
export type DownloadKind = 'http' | 'media' | 'spotify'

export type Category = 'video' | 'music' | 'documents' | 'compressed' | 'programs' | 'images' | 'other'

export type SidebarFilter = 'all' | 'active' | 'unfinished' | 'finished' | Category

/** Byte range handled by one connection. `end` is inclusive. */
export interface Segment {
  start: number
  end: number
  downloaded: number
}

export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav' | 'best'
export type VideoContainer = 'mp4' | 'mkv' | 'webm'

export type MediaMode = 'video' | 'audio' | 'thumbnail' | 'subtitles'

export interface MediaOptions {
  /** thumbnail / subtitles download only that, without the video */
  mode: MediaMode
  /** Max video height (e.g. 1080). 0 means best available. */
  quality: number
  container: VideoContainer
  audioFormat: AudioFormat
  /** kbps, 0 = best */
  audioBitrate: number
  subtitles: boolean
  subtitleLangs: string
  embedThumbnail: boolean
  /** Explicit yt-dlp format id picked in the advanced list */
  formatId?: string
}

/** Song metadata taken from Spotify, applied to the file after the audio is fetched */
export interface TrackMeta {
  title: string
  artist: string
  album?: string
  cover?: string
  durationMs?: number
}

export interface DownloadItem {
  id: string
  kind: DownloadKind
  url: string
  pageUrl?: string
  referrer?: string
  headers?: Record<string, string>
  cookies?: string
  fileName: string
  directory: string
  category: Category
  /** -1 when unknown */
  size: number
  downloaded: number
  status: DownloadStatus
  error?: string
  resumable: boolean
  segments: Segment[]
  createdAt: number
  completedAt?: number
  /** bytes/sec, runtime only */
  speed: number
  /** seconds, -1 unknown */
  eta: number
  media?: MediaOptions
  title?: string
  thumbnail?: string
  /** Human readable sub-stage for media jobs, e.g. "merging" */
  stage?: string
  /** Groups items created from one playlist */
  playlistTitle?: string
  track?: TrackMeta
}

export interface NewDownloadRequest {
  url: string
  kind: DownloadKind
  fileName?: string
  directory?: string
  headers?: Record<string, string>
  cookies?: string
  referrer?: string
  pageUrl?: string
  media?: MediaOptions
  title?: string
  thumbnail?: string
  size?: number
  startPaused?: boolean
  playlistTitle?: string
  track?: TrackMeta
}

export interface CategoryConfig {
  extensions: string[]
  folder: string
}

export interface SchedulerSettings {
  enabled: boolean
  /** HH:MM, empty = start immediately when enabled */
  startTime: string
  /** HH:MM, empty = never stop */
  stopTime: string
  /** 0 = Sunday ... 6 = Saturday */
  days: number[]
  afterDone: 'none' | 'exit' | 'sleep' | 'shutdown'
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  language: string
  theme: ThemeMode
  downloadDir: string
  useCategoryFolders: boolean
  maxConcurrent: number
  connectionsPerDownload: number
  speedLimitEnabled: boolean
  /** KB/s for all downloads together */
  speedLimitKBps: number
  maxRetries: number
  timeoutSec: number
  userAgent: string
  proxy: { mode: 'none' | 'system' | 'manual'; url: string }
  onFileExists: 'rename' | 'overwrite'
  confirmBrowserDownloads: boolean
  clipboardMonitor: boolean
  startWithSystem: boolean
  minimizeToTray: boolean
  notifications: boolean
  browserIntegration: {
    enabled: boolean
    port: number
    interceptExtensions: string[]
    minSizeKB: number
    skipDomains: string[]
  }
  media: {
    defaultMode: 'video' | 'audio'
    defaultQuality: number
    defaultContainer: VideoContainer
    defaultAudioFormat: AudioFormat
    cookiesFromBrowser: '' | 'chrome' | 'edge' | 'firefox' | 'brave' | 'opera' | 'vivaldi' | 'chromium'
    concurrentFragments: number
    embedMetadata: boolean
    embedThumbnail: boolean
  }
  spotify: { clientId: string; clientSecret: string }
  scheduler: SchedulerSettings
  categories: Record<Category, CategoryConfig>
  /** Donation prompt bookkeeping: shown once after a number of finished downloads */
  support: { completedCount: number; prompted: boolean }
  /** The browser-extension setup screen is shown once on first launch */
  onboarding: { extensionShown: boolean }
}

export interface MediaFormat {
  id: string
  ext: string
  height?: number
  fps?: number
  vcodec?: string
  acodec?: string
  abr?: number
  tbr?: number
  filesize?: number
  note?: string
}

export interface MediaInfo {
  type: 'single'
  url: string
  title: string
  thumbnail?: string
  duration?: number
  uploader?: string
  extractor: string
  heights: number[]
  formats: MediaFormat[]
}

export interface PlaylistEntry {
  url: string
  title: string
  duration?: number
  thumbnail?: string
  track?: TrackMeta
}

export interface PlaylistInfo {
  type: 'playlist'
  url: string
  title: string
  uploader?: string
  extractor: string
  entries: PlaylistEntry[]
}

export type ProbeResult =
  | { kind: 'http'; url: string; fileName: string; size: number; resumable: boolean; mime?: string }
  | { kind: 'media'; info: MediaInfo | PlaylistInfo }
  | { kind: 'spotify'; info: MediaInfo | PlaylistInfo }

export interface ComponentsState {
  ytdlp: { ready: boolean; version?: string; busy: boolean; error?: string }
  ffmpeg: { ready: boolean }
}

export interface AppState {
  downloads: DownloadItem[]
  settings: Settings
  components: ComponentsState
  version: string
  platform: string
  /** Installed from the Microsoft Store (MSIX package) */
  windowsStore: boolean
}

export type BrowserId = 'chrome' | 'edge' | 'brave' | 'opera' | 'vivaldi' | 'firefox'

export interface BrowserInfo {
  id: BrowserId
  name: string
  kind: 'chromium' | 'firefox'
  path: string
}

/** What the browser extension / clipboard hands to the UI */
export interface ExternalAddRequest {
  url: string
  fileName?: string
  size?: number
  referrer?: string
  pageUrl?: string
  cookies?: string
  userAgent?: string
  /** true when the extension says this is a page with media (YouTube button etc.) */
  media?: boolean
  /** Which button was used on the video: Download (video) or ♪ (audio only) */
  mode?: 'video' | 'audio'
  /** Extension quick mode: start right away with default options, no dialog */
  quick?: boolean
}
