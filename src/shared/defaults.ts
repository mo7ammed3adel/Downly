import type { Category, CategoryConfig, Settings, SettingsPatch } from './types'

export const DEFAULT_CATEGORIES: Record<Category, CategoryConfig> = {
  video: {
    folder: 'Video',
    extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'm2ts', 'vob', 'ogv']
  },
  music: {
    folder: 'Music',
    extensions: ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus', 'wma', 'aif', 'aiff', 'ape', 'mka']
  },
  documents: {
    folder: 'Documents',
    extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'epub', 'csv', 'md', 'srt', 'vtt', 'ass', 'lrc']
  },
  compressed: {
    folder: 'Compressed',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'zst', 'iso', 'cab', 'lz', 'lzma']
  },
  programs: {
    folder: 'Programs',
    extensions: ['exe', 'msi', 'msix', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'bat', 'jar', 'xapk']
  },
  images: {
    folder: 'Images',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'ico', 'heic', 'avif', 'psd', 'raw']
  },
  other: { folder: 'Other', extensions: [] }
}

/** Extensions the browser extension hands over to the app (IDM-style list) */
export const DEFAULT_INTERCEPT = [
  ...DEFAULT_CATEGORIES.compressed.extensions,
  ...DEFAULT_CATEGORIES.programs.extensions,
  ...DEFAULT_CATEGORIES.video.extensions,
  ...DEFAULT_CATEGORIES.music.extensions,
  'pdf', 'epub', 'torrent', 'bin', 'img'
]

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export const BRIDGE_PORT = 58732
/** When a port is taken the bridge moves to the next one; the extension scans the same range */
export const BRIDGE_PORT_COUNT = 10

export function createDefaultSettings(downloadDir: string, language: string): Settings {
  return {
    language,
    theme: 'system',
    downloadDir,
    useCategoryFolders: true,
    maxConcurrent: 3,
    connectionsPerDownload: 8,
    speedLimitEnabled: false,
    speedLimitKBps: 1024,
    maxRetries: 10,
    timeoutSec: 30,
    userAgent: DEFAULT_USER_AGENT,
    proxy: { mode: 'system', url: '' },
    onFileExists: 'rename',
    confirmBrowserDownloads: true,
    clipboardMonitor: true,
    startWithSystem: false,
    autoUpdateCheck: true,
    minimizeToTray: true,
    notifications: true,
    browserIntegration: {
      enabled: true,
      port: BRIDGE_PORT,
      takeAll: true,
      interceptExtensions: DEFAULT_INTERCEPT,
      minSizeKB: 0,
      skipDomains: []
    },
    media: {
      defaultMode: 'video',
      defaultQuality: 1080,
      defaultContainer: 'mp4',
      defaultAudioFormat: 'mp3',
      cookiesFromBrowser: '',
      concurrentFragments: 4,
      embedMetadata: true,
      embedThumbnail: true,
      subtitles: false,
      subtitleLangs: language === 'ar' ? 'ar.*,en.*' : 'en.*,ar.*'
    },
    spotify: { clientId: '', clientSecret: '' },
    scheduler: { enabled: false, startTime: '02:00', stopTime: '', days: [0, 1, 2, 3, 4, 5, 6], afterDone: 'none' },
    categories: DEFAULT_CATEGORIES,
    support: { completedCount: 0, prompted: false },
    onboarding: { extensionShown: false, idmDismissed: false }
  }
}

/** Deep-ish merge so settings saved by older versions pick up new keys */
export function mergeSettings(base: Settings, saved: SettingsPatch | undefined): Settings {
  if (!saved) return base
  return {
    ...base,
    ...saved,
    proxy: { ...base.proxy, ...saved.proxy },
    browserIntegration: { ...base.browserIntegration, ...saved.browserIntegration },
    media: { ...base.media, ...saved.media },
    spotify: { ...base.spotify, ...saved.spotify },
    scheduler: { ...base.scheduler, ...saved.scheduler },
    categories: { ...base.categories, ...saved.categories },
    support: { ...base.support, ...saved.support },
    onboarding: { ...base.onboarding, ...saved.onboarding }
  }
}
