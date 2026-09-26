import { describe, expect, it } from 'vitest'
import { categorize, expandBatchPattern, isKnownMediaSite, parseSpotifyUrl, sanitizeFileName } from '@shared/util'
import { DEFAULT_CATEGORIES } from '@shared/defaults'
import { fileNameFrom } from '../src/main/engine/http'
import { ytdlpDownloadUrl } from '../src/main/services/ytdlpBuilds'

describe('expandBatchPattern', () => {
  it('keeps zero padding of numeric ranges', () => {
    expect(expandBatchPattern('https://x.com/f[08-11].zip')).toEqual([
      'https://x.com/f08.zip',
      'https://x.com/f09.zip',
      'https://x.com/f10.zip',
      'https://x.com/f11.zip'
    ])
  })

  it('expands letter ranges and nested patterns', () => {
    expect(expandBatchPattern('https://x.com/[a-b]/[1-2].jpg')).toEqual([
      'https://x.com/a/1.jpg',
      'https://x.com/a/2.jpg',
      'https://x.com/b/1.jpg',
      'https://x.com/b/2.jpg'
    ])
  })

  it('returns plain URLs untouched', () => {
    expect(expandBatchPattern('https://x.com/file.zip')).toEqual(['https://x.com/file.zip'])
  })
})

describe('file names', () => {
  it('strips characters Windows cannot store', () => {
    expect(sanitizeFileName('a<b>:c"d|e?.mp4')).toBe('a_b__c_d_e_.mp4')
    expect(sanitizeFileName('CON.txt')).toBe('_CON.txt')
  })

  it('prefers RFC 5987 filename* from Content-Disposition', () => {
    const name = fileNameFrom('https://x.com/dl?id=1', `attachment; filename="fallback.zip"; filename*=UTF-8''%D9%85%D9%84%D9%81.zip`)
    expect(name).toBe('ملف.zip')
  })

  it('falls back to the URL path, then adds an extension from the MIME type', () => {
    expect(fileNameFrom('https://x.com/files/setup%20v2.exe?x=1')).toBe('setup v2.exe')
    expect(fileNameFrom('https://x.com/download', undefined, 'application/pdf')).toBe('download.pdf')
  })

  it('sorts files into categories by extension', () => {
    expect(categorize('movie.MKV', DEFAULT_CATEGORIES)).toBe('video')
    expect(categorize('setup.exe', DEFAULT_CATEGORIES)).toBe('programs')
    expect(categorize('noext', DEFAULT_CATEGORIES)).toBe('other')
  })
})

describe('link detection', () => {
  it('recognises Spotify links including intl paths', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/intl-ar/track/4uLU6hMCjMI75M1A2tKUQC?si=x')).toEqual({
      type: 'track',
      id: '4uLU6hMCjMI75M1A2tKUQC'
    })
    expect(parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')?.type).toBe('playlist')
    expect(parseSpotifyUrl('https://example.com/track/abc')).toBeNull()
  })

  it('routes known video sites to the media engine', () => {
    expect(isKnownMediaSite('https://www.youtube.com/watch?v=abc')).toBe(true)
    expect(isKnownMediaSite('https://m.youtube.com/watch?v=abc')).toBe(true)
    expect(isKnownMediaSite('https://youtu.be/abc')).toBe(true)
    expect(isKnownMediaSite('https://notyoutube.com/x')).toBe(false)
  })
})

describe('yt-dlp build selection', () => {
  it('uses the Windows 7 builds on NT 6.1 and the official ones from Windows 8', () => {
    expect(ytdlpDownloadUrl('win32', 'x64', '6.1.7601')).toMatch(/nicolaasjan\/yt-dlp\/.*\/yt-dlp_win7\.exe$/)
    expect(ytdlpDownloadUrl('win32', 'ia32', '6.1.7601')).toMatch(/yt-dlp_x86_win7\.exe$/)
    expect(ytdlpDownloadUrl('win32', 'x64', '6.2.9200')).toMatch(/yt-dlp\/yt-dlp\/.*\/yt-dlp\.exe$/)
    expect(ytdlpDownloadUrl('win32', 'ia32', '10.0.22631')).toMatch(/\/yt-dlp_x86\.exe$/)
    expect(ytdlpDownloadUrl('darwin', 'arm64', '23.0.0')).toMatch(/yt-dlp_macos$/)
  })
})
