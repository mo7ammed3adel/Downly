import { describe, expect, it } from 'vitest'
import type { DownloadItem } from '@shared/types'
import { createDefaultSettings } from '@shared/defaults'
import { buildDownloadArgs, requestArgs, type YtdlpEnv } from '../src/main/engine/ytdlp'

const env: YtdlpEnv = {
  ytdlpPath: 'yt-dlp',
  ffmpegPath: null,
  nodePath: null,
  supportsJsRuntimes: false,
  proxy: null,
  settings: createDefaultSettings('/downloads', 'ar')
}

const video = (subtitles: boolean): DownloadItem => ({
  id: 'x',
  kind: 'media',
  url: 'https://www.youtube.com/watch?v=abc',
  fileName: 'v',
  directory: '/downloads',
  category: 'video',
  size: -1,
  downloaded: 0,
  status: 'queued',
  resumable: false,
  segments: [],
  createdAt: 0,
  speed: 0,
  eta: -1,
  cookies: 'sid=1',
  referrer: 'https://site.example/watch',
  headers: { 'x-token': 't', 'user-agent': 'UA' },
  media: { mode: 'video', quality: 720, container: 'mp4', audioFormat: 'mp3', audioBitrate: 0, subtitles, subtitleLangs: 'ar.*', embedThumbnail: false }
})

describe('subtitle fallbacks', () => {
  it('asks for written and automatic subtitles first, then written only, then none', () => {
    const args = (subs: 'all' | 'written' | 'none') => buildDownloadArgs(video(true), env, 0, '/tmp/p', subs).join(' ')
    expect(args('all')).toContain('--write-subs --write-auto-subs --sub-langs ar.* --embed-subs')
    expect(args('written')).toContain('--write-subs --sub-langs ar.* --embed-subs')
    expect(args('written')).not.toContain('--write-auto-subs')
    expect(args('none')).not.toContain('--write-subs')
  })
  it('adds no subtitles when they are off', () => {
    expect(buildDownloadArgs(video(false), env, 0, '/tmp/p').join(' ')).not.toContain('--write-subs')
  })
})

describe('requestArgs', () => {
  it("repeats the browser's request details to the site", () => {
    expect(requestArgs({ cookies: 'sid=1', referrer: 'https://site.example/watch', headers: { 'x-token': 't', 'user-agent': 'UA' } })).toEqual([
      '--referer', 'https://site.example/watch',
      '--user-agent', 'UA',
      '--add-header', 'x-token:t',
      '--add-header', 'Cookie:sid=1'
    ])
  })
  it('passes them on downloads too', () => {
    const args = buildDownloadArgs(video(false), env, 0, '/tmp/p').join(' ')
    expect(args).toContain('--referer https://site.example/watch')
    expect(args).toContain('--add-header Cookie:sid=1')
  })
})
