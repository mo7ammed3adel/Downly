/**
 * Real-network checks for the media engine. Opt-in:
 *   SG_YTDLP=<path to yt-dlp> npx vitest run tests/media.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import type { DownloadItem, MediaOptions } from '@shared/types'
import { createDefaultSettings } from '@shared/defaults'
import { analyze, YtdlpDownload, type YtdlpEnv } from '../src/main/engine/ytdlp'
import { resolveSpotify } from '../src/main/engine/spotify'

const YTDLP = process.env.SG_YTDLP
const VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw' // "Me at the zoo", 19 s
const PLAYLIST = 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'

let dir = ''
let env: YtdlpEnv

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sg-media-'))
  env = {
    ytdlpPath: YTDLP ?? '',
    ffmpegPath: ffmpegPath as unknown as string,
    nodePath: process.execPath,
    supportsJsRuntimes: true,
    proxy: null,
    settings: createDefaultSettings(dir, 'en')
  }
})
afterAll(() => rm(dir, { recursive: true, force: true }))

const baseMedia: MediaOptions = {
  mode: 'video',
  quality: 240,
  container: 'mp4',
  audioFormat: 'mp3',
  audioBitrate: 0,
  subtitles: false,
  subtitleLangs: '',
  embedThumbnail: true
}

function item(url: string, media: MediaOptions, extra: Partial<DownloadItem> = {}): DownloadItem {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'media',
    url,
    fileName: 'x',
    directory: dir,
    category: 'video',
    size: -1,
    downloaded: 0,
    status: 'downloading',
    resumable: false,
    segments: [],
    createdAt: Date.now(),
    speed: 0,
    eta: -1,
    media,
    ...extra
  }
}

describe.skipIf(!YTDLP)('media engine (network)', () => {
  it('lists formats and qualities of a YouTube video', async () => {
    const info = await analyze(VIDEO, env)
    expect(info.type).toBe('single')
    if (info.type !== 'single') return
    expect(info.title).toMatch(/zoo/i)
    expect(info.heights.length).toBeGreaterThan(0)
  }, 120_000)

  it('lists playlist entries without downloading them', async () => {
    const info = await analyze(PLAYLIST, env)
    expect(info.type).toBe('playlist')
    if (info.type === 'playlist') expect(info.entries.length).toBeGreaterThan(1)
  }, 120_000)

  it('downloads a 240p mp4 with progress', async () => {
    const it = item(VIDEO, baseMedia)
    let updates = 0
    await new YtdlpDownload(it, env, { rateLimitKBps: 0, onProgress: () => updates++ }).start()
    expect(it.fileName.endsWith('.mp4')).toBe(true)
    expect((await stat(join(it.directory, it.fileName))).size).toBeGreaterThan(50_000)
    expect(updates).toBeGreaterThan(0)
  }, 180_000)

  it('extracts audio only as mp3', async () => {
    const it = item(VIDEO, { ...baseMedia, mode: 'audio', audioBitrate: 128 })
    await new YtdlpDownload(it, env, { rateLimitKBps: 0, onProgress: () => {} }).start()
    expect(it.fileName.endsWith('.mp3')).toBe(true)
    expect((await stat(join(it.directory, it.fileName))).size).toBeGreaterThan(50_000)
  }, 180_000)

  it('saves only the thumbnail as jpg', async () => {
    const it = item(VIDEO, { ...baseMedia, mode: 'thumbnail' })
    await new YtdlpDownload(it, env, { rateLimitKBps: 0, onProgress: () => {} }).start()
    expect(it.fileName.endsWith('.jpg')).toBe(true)
    expect((await stat(join(it.directory, it.fileName))).size).toBeGreaterThan(1000)
  }, 120_000)

  it('saves only the subtitles as srt', async () => {
    // A TED talk with human-made English subtitles
    const it = item('https://www.youtube.com/watch?v=arj7oStGLkU', { ...baseMedia, mode: 'subtitles', subtitleLangs: 'en' })
    await new YtdlpDownload(it, env, { rateLimitKBps: 0, onProgress: () => {} }).start()
    expect(it.fileName.endsWith('.srt')).toBe(true)
    expect((await stat(join(it.directory, it.fileName))).size).toBeGreaterThan(500)
  }, 120_000)

  it('reads Spotify metadata and fetches the matching song as tagged mp3', async () => {
    const pl = await resolveSpotify('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8', { clientId: '', clientSecret: '' })
    expect(pl.entries).toHaveLength(1)
    const track = pl.entries[0].track!
    expect(track.title.length).toBeGreaterThan(0)
    expect(track.artist.length).toBeGreaterThan(0)

    const it = item(pl.entries[0].url, { ...baseMedia, mode: 'audio', audioBitrate: 128 }, { kind: 'spotify', track })
    await new YtdlpDownload(it, env, { rateLimitKBps: 0, onProgress: () => {} }).start()
    expect(it.fileName).toBe(`${track.artist} - ${track.title}.mp3`.replace(/[<>:"/\\|?*]/g, '_'))
  }, 240_000)
})
