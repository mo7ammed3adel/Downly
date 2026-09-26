import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { DownloadItem, MediaFormat, MediaInfo, PlaylistInfo, RequestContext, Settings } from '@shared/types'
import { searchQuery } from './spotify'
import { AbortError } from './errors'

export interface YtdlpEnv {
  ytdlpPath: string
  ffmpegPath: string | null
  /** Electron binary used as a Node JS runtime for YouTube's player challenges */
  nodePath: string | null
  supportsJsRuntimes: boolean
  proxy: string | null
  settings: Settings
}

function baseArgs(env: YtdlpEnv): string[] {
  const args = ['--no-warnings', '--encoding', 'utf-8', '--no-color']
  if (env.proxy) args.push('--proxy', env.proxy)
  if (env.settings.media.cookiesFromBrowser) args.push('--cookies-from-browser', env.settings.media.cookiesFromBrowser)
  if (env.ffmpegPath) args.push('--ffmpeg-location', env.ffmpegPath)
  if (env.nodePath && env.supportsJsRuntimes) args.push('--js-runtimes', `node:${env.nodePath}`)
  args.push('--user-agent', env.settings.userAgent)
  return args
}

/**
 * The browser's own request details, so sites that check them (Referer, session cookies,
 * token headers) answer yt-dlp like they answered the browser. Later flags override baseArgs.
 */
export function requestArgs(ctx: RequestContext): string[] {
  const args: string[] = []
  const userAgent = ctx.userAgent ?? ctx.headers?.['user-agent']
  if (ctx.referrer) args.push('--referer', ctx.referrer)
  if (userAgent) args.push('--user-agent', userAgent)
  for (const [name, value] of Object.entries(ctx.headers ?? {})) {
    if (name.toLowerCase() !== 'user-agent') args.push('--add-header', `${name}:${value}`)
  }
  // yt-dlp scopes a Cookie header to the domain of the URL it downloads
  if (ctx.cookies) args.push('--add-header', `Cookie:${ctx.cookies}`)
  return args
}

function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ELECTRON_RUN_AS_NODE: '1' }
}

interface RawFormat {
  format_id: string
  ext: string
  height?: number | null
  fps?: number | null
  vcodec?: string
  acodec?: string
  abr?: number | null
  tbr?: number | null
  filesize?: number | null
  filesize_approx?: number | null
  format_note?: string
}

interface RawInfo {
  _type?: string
  id: string
  title?: string
  thumbnail?: string
  thumbnails?: { url: string }[]
  duration?: number
  uploader?: string
  channel?: string
  extractor_key?: string
  webpage_url?: string
  url?: string
  formats?: RawFormat[]
  entries?: RawInfo[]
  ie_key?: string
}

export function analyze(url: string, env: YtdlpEnv, signal?: AbortSignal, ctx: RequestContext = {}): Promise<MediaInfo | PlaylistInfo> {
  const args = [...baseArgs(env), ...requestArgs(ctx), '-J', '--flat-playlist', url]
  return new Promise((resolve, reject) => {
    execFile(
      env.ytdlpPath,
      args,
      { env: childEnv(), maxBuffer: 256 * 1024 * 1024, windowsHide: true, timeout: 120_000, signal, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(cleanError(stderr) || err.message))
        try {
          resolve(toInfo(JSON.parse(stdout) as RawInfo, url))
        } catch (e) {
          reject(e)
        }
      }
    )
  })
}

function cleanError(stderr: string): string {
  const line = stderr.split(/\r?\n/).reverse().find((l) => l.includes('ERROR'))
  return (line ?? stderr.trim().split(/\r?\n/).pop() ?? '').replace(/^ERROR:\s*/, '').slice(0, 400)
}

function toInfo(raw: RawInfo, url: string): MediaInfo | PlaylistInfo {
  if (raw._type === 'playlist' || raw.entries) {
    return {
      type: 'playlist',
      url,
      title: raw.title ?? 'Playlist',
      uploader: raw.uploader ?? raw.channel,
      extractor: raw.extractor_key ?? 'generic',
      entries: (raw.entries ?? [])
        .filter((e) => e && (e.url || e.webpage_url))
        .map((e) => ({
          url: entryUrl(e),
          title: e.title ?? e.id,
          duration: e.duration ?? undefined,
          thumbnail: e.thumbnails?.at(-1)?.url ?? e.thumbnail
        }))
    }
  }
  const formats: MediaFormat[] = (raw.formats ?? [])
    .filter((f) => f.format_id && f.ext !== 'mhtml')
    .map((f) => ({
      id: f.format_id,
      ext: f.ext,
      height: f.height ?? undefined,
      fps: f.fps ?? undefined,
      vcodec: f.vcodec,
      acodec: f.acodec,
      abr: f.abr ?? undefined,
      tbr: f.tbr ?? undefined,
      filesize: f.filesize ?? f.filesize_approx ?? undefined,
      note: f.format_note
    }))
  const heights = [...new Set(formats.filter((f) => f.vcodec && f.vcodec !== 'none' && f.height).map((f) => f.height!))].sort(
    (a, b) => b - a
  )
  return {
    type: 'single',
    url: raw.webpage_url ?? url,
    title: raw.title ?? raw.id,
    thumbnail: raw.thumbnail,
    duration: raw.duration,
    uploader: raw.uploader ?? raw.channel,
    extractor: raw.extractor_key ?? 'generic',
    heights,
    formats
  }
}

function entryUrl(e: RawInfo): string {
  const u = e.webpage_url ?? e.url ?? ''
  if (/^https?:/.test(u)) return u
  // Flat YouTube entries sometimes only carry the id
  if ((e.ie_key ?? '').toLowerCase().startsWith('youtube')) return `https://www.youtube.com/watch?v=${e.id}`
  return u
}

const PROGRESS_PREFIX = 'SGPROG '

/** Escape user text for use inside a yt-dlp output template */
const tpl = (s: string) => s.replace(/%/g, '%%')

/** Which subtitles to embed: written and automatic, only written ones, or none (fallbacks) */
export type SubtitleSource = 'all' | 'written' | 'none'

export function buildDownloadArgs(
  item: DownloadItem,
  env: YtdlpEnv,
  rateLimitKBps: number,
  pathFile: string,
  subs: SubtitleSource = 'all'
): string[] {
  const m = item.media!
  const s = env.settings.media
  const args = [
    ...baseArgs(env),
    ...requestArgs({ cookies: item.cookies, referrer: item.referrer, headers: item.headers }),
    '--newline',
    '--progress',
    '--no-playlist',
    '--no-mtime',
    '--continue',
    '-N', String(Math.max(1, s.concurrentFragments)),
    '--progress-template',
    `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s`,
    // --print would imply --quiet and hide the post-processing stages, so write the path to a file
    '--print-to-file', 'after_move:%(filepath)s', pathFile,
    '-P', item.directory
  ]
  if (rateLimitKBps > 0) args.push('-r', `${Math.max(1, Math.round(rateLimitKBps))}K`)

  if (item.kind === 'spotify' && item.track) {
    args.push('-o', tpl(sanitize(`${item.track.artist} - ${item.track.title}`)) + '.%(ext)s')
  } else {
    args.push('-o', '%(title).180B.%(ext)s')
  }

  if (isSideFileMode(m.mode)) {
    args.push('--skip-download')
    if (m.mode === 'thumbnail') args.push('--write-thumbnail', '--convert-thumbnails', 'jpg')
    else args.push('--write-subs', '--write-auto-subs', '--sub-langs', m.subtitleLangs || 'en.*,ar.*', '--convert-subs', 'srt')
    args.push(item.url)
    return args
  }

  if (m.mode === 'audio') {
    args.push('-f', m.formatId ? m.formatId : 'ba/b', '-x')
    if (m.audioFormat !== 'best') args.push('--audio-format', m.audioFormat)
    args.push('--audio-quality', m.audioBitrate > 0 ? `${m.audioBitrate}K` : '0')
  } else {
    const height = m.quality
    if (m.formatId) {
      args.push('-f', `${m.formatId}+ba/${m.formatId}`)
    } else {
      args.push('-f', height > 0 ? `bv*[height<=${height}]+ba/b[height<=${height}]/bv*+ba/b` : 'bv*+ba/b')
      const sort = [height > 0 ? `res:${height}` : 'res']
      if (m.container === 'mp4') sort.push('vcodec:h264', 'acodec:m4a')
      args.push('-S', sort.join(','))
    }
    args.push('--merge-output-format', m.container, '--remux-video', m.container)
    // Auto captions fill in where nobody wrote subtitles (most YouTube videos, incl. auto-translated Arabic)
    if (m.subtitles && subs !== 'none') {
      args.push('--write-subs', ...(subs === 'all' ? ['--write-auto-subs'] : []), '--sub-langs', m.subtitleLangs || 'ar.*,en.*', '--embed-subs')
    }
  }

  const canEmbedThumb = m.mode === 'video' ? m.container !== 'webm' : ['mp3', 'm4a', 'flac', 'opus', 'best'].includes(m.audioFormat)
  if (m.embedThumbnail && canEmbedThumb && item.kind !== 'spotify') args.push('--embed-thumbnail', '--convert-thumbnails', 'jpg')
  if (s.embedMetadata && item.kind !== 'spotify') args.push('--embed-metadata')

  args.push(item.kind === 'spotify' && item.track ? searchQuery(item.track) : item.url)
  return args
}

/** Modes that fetch only a companion file (cover image / subtitles) instead of the media */
export const isSideFileMode = (mode: string) => mode === 'thumbnail' || mode === 'subtitles'

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 180) || 'track'
}

/**
 * Runs one yt-dlp job and mirrors its progress into the item. Separate video and audio
 * streams are downloaded one after another, so byte counts are accumulated across them.
 */
export class YtdlpDownload {
  private proc?: ChildProcess
  private stopped = false

  constructor(
    private item: DownloadItem,
    private env: YtdlpEnv,
    private opts: { rateLimitKBps: number; onProgress(): void }
  ) {}

  stop(): void {
    this.stopped = true
    killTree(this.proc)
  }

  async start(): Promise<void> {
    const item = this.item
    const pathFile = join(tmpdir(), `sg-${item.id}.path`)
    await rm(pathFile, { force: true })
    let base = 0
    let lastTotal = 0
    let lastDone = 0
    let stderrTail = ''
    item.downloaded = 0
    // Side files (thumbnail/subtitles) skip the "after_move" stage, so detect them by diffing the folder
    const sideMode = isSideFileMode(item.media!.mode)
    const before = sideMode ? new Set(await readdir(item.directory).catch(() => [] as string[])) : null

    const run = (args: string[]) => new Promise<void>((resolve, reject) => {
      base = lastTotal = lastDone = 0
      stderrTail = ''
      const proc = spawn(this.env.ytdlpPath, args, { env: childEnv(), windowsHide: true })
      this.proc = proc
      let buf = ''
      const onLine = (line: string) => {
        if (line.startsWith(PROGRESS_PREFIX)) {
          const [done, total, estimate, speed, eta] = line.slice(PROGRESS_PREFIX.length).split(' ').map(Number)
          const t = Number.isFinite(total) ? total : Number.isFinite(estimate) ? estimate : 0
          // A new stream started (e.g. audio after video)
          if (Number.isFinite(done) && done < lastDone && lastTotal > 0) base += lastTotal
          if (Number.isFinite(done)) lastDone = done
          if (t) lastTotal = t
          item.downloaded = base + (Number.isFinite(done) ? done : 0)
          item.size = base + (t || -1)
          item.speed = Number.isFinite(speed) ? speed : 0
          item.eta = Number.isFinite(eta) ? eta : -1
          item.stage = undefined
          this.opts.onProgress()
        } else if (/^\[(Merger|ExtractAudio|VideoRemuxer|VideoConvertor|EmbedThumbnail|Metadata|EmbedSubtitle|FixupM3u8|FixupM4a)\]/.test(line)) {
          item.stage = line.slice(1, line.indexOf(']'))
          item.speed = 0
          this.opts.onProgress()
        } else if (/^\[download\] Destination:/.test(line) && !item.title) {
          // Quick-mode jobs start without a title — show the real name as soon as yt-dlp knows it
          item.fileName = basename(line.replace(/^\[download\] Destination:\s*/, '')).replace(/\.f\d+(\.\w+)$/, '$1')
          this.opts.onProgress()
        }
      }
      proc.stdout.setEncoding('utf8')
      proc.stdout.on('data', (chunk: string) => {
        buf += chunk
        let i: number
        while ((i = buf.search(/\r?\n/)) >= 0) {
          onLine(buf.slice(0, i).trim())
          buf = buf.slice(buf[i] === '\r' ? i + 2 : i + 1)
        }
      })
      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-4000)
      })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (this.stopped) return reject(new AbortError())
        if (code === 0) return resolve()
        reject(new Error(cleanError(stderrTail) || `yt-dlp exited with code ${code}`))
      })
    })

    // yt-dlp fails the whole video when a subtitle can't be fetched, and YouTube often refuses its
    // auto-translated captions (HTTP 429). The video matters more: drop the automatic subtitles,
    // then all subtitles, rather than the download.
    const attempts: SubtitleSource[] = item.media?.subtitles ? ['all', 'written', 'none'] : ['all']
    for (const [i, subs] of attempts.entries()) {
      try {
        await run(buildDownloadArgs(item, this.env, this.opts.rateLimitKBps, pathFile, subs))
        break
      } catch (err) {
        const last = i === attempts.length - 1
        if (last || this.stopped || !/subtitle/i.test(String(err))) throw err
      }
    }

    const printed = await readFile(pathFile, 'utf8').catch(() => '')
    await rm(pathFile, { force: true })
    let finalPath = printed.trim().split(/\r?\n/).pop() || undefined
    if (before) {
      const created = (await readdir(item.directory).catch(() => [] as string[])).filter(
        (f) => !before.has(f) && !/\.(part|ytdl|temp)$/i.test(f)
      )
      if (!created.length) throw new Error(item.media!.mode === 'subtitles' ? 'No subtitles available for this video' : 'No thumbnail available')
      finalPath = join(item.directory, created[0])
    }
    if (finalPath) {
      item.directory = dirname(finalPath)
      item.fileName = basename(finalPath)
      const st = await stat(finalPath).catch(() => null)
      if (st) item.size = item.downloaded = st.size
    }
    if (item.kind === 'spotify' && item.track && finalPath && this.env.ffmpegPath) {
      item.stage = 'Metadata'
      this.opts.onProgress()
      await tagAudio(finalPath, item.track, this.env.ffmpegPath).catch(() => {})
    }
  }
}

function killTree(proc?: ChildProcess): void {
  if (!proc?.pid || proc.exitCode !== null) return
  if (process.platform === 'win32') {
    // yt-dlp spawns ffmpeg; kill the whole tree so the .part files are released
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true })
  } else {
    proc.kill('SIGTERM')
  }
}

/** Writes Spotify tags + cover art into the downloaded audio using ffmpeg */
async function tagAudio(file: string, t: { title: string; artist: string; album?: string; cover?: string }, ffmpeg: string): Promise<void> {
  const ext = file.slice(file.lastIndexOf('.'))
  const tmp = join(dirname(file), `.sgtag-${Date.now()}${ext}`)
  const args = ['-y', '-i', file]
  const withCover = !!t.cover && ['.mp3', '.m4a'].includes(ext)
  if (withCover) args.push('-i', t.cover!)
  args.push('-map', '0:a')
  if (withCover) args.push('-map', '1:v', '-disposition:v:0', 'attached_pic')
  args.push('-c', 'copy', '-map_metadata', '-1', '-metadata', `title=${t.title}`, '-metadata', `artist=${t.artist}`)
  if (t.album) args.push('-metadata', `album=${t.album}`)
  if (ext === '.mp3') args.push('-id3v2_version', '3')
  args.push(tmp)
  await new Promise<void>((resolve, reject) => {
    execFile(ffmpeg, args, { windowsHide: true, timeout: 120_000 }, (err) => (err ? reject(err) : resolve()))
  })
  await rm(file, { force: true })
  await rename(tmp, file)
}
