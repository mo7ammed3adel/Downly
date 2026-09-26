import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlaylistEntry, PlaylistInfo } from '@shared/types'
import { normalizeChannelUrl, Subscriptions } from '../src/main/services/subscriptions'

const channel = (ids: string[]): PlaylistInfo => ({
  type: 'playlist',
  url: 'https://www.youtube.com/@chan/videos',
  title: 'My Channel',
  extractor: 'youtube:tab',
  entries: ids.map((id) => ({ url: `https://www.youtube.com/watch?v=${id}`, title: id }))
})

describe('normalizeChannelUrl', () => {
  it("points YouTube channels at their uploads", () => {
    expect(normalizeChannelUrl('https://www.youtube.com/@chan')).toBe('https://www.youtube.com/@chan/videos')
    expect(normalizeChannelUrl('https://www.youtube.com/channel/UC123/')).toBe('https://www.youtube.com/channel/UC123/videos')
    expect(normalizeChannelUrl('https://www.youtube.com/playlist?list=PL1')).toBe('https://www.youtube.com/playlist?list=PL1')
  })
})

describe('Subscriptions', () => {
  let dir = ''
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('downloads only videos that appear after following, once', async () => {
    dir = await mkdtemp(join(tmpdir(), 'downly-subs-'))
    let current = ['a', 'b', 'c']
    const downloaded: string[][] = []
    const listArgs: string[][] = []
    const subs = new Subscriptions({
      file: join(dir, 'subs.json'),
      list: async (_url, extra) => (listArgs.push(extra), channel(current)),
      download: async (_sub, entries: PlaylistEntry[]) => void downloaded.push(entries.map((e) => e.title))
    })
    await subs.load()

    const sub = await subs.add('https://www.youtube.com/@chan', 'audio')
    expect(sub.title).toBe('My Channel')
    expect(listArgs[0]).toEqual(['--playlist-end', '50']) // channels: newest videos only

    await subs.checkAll()
    expect(downloaded).toEqual([]) // nothing new yet: the old videos are not pulled

    current = ['d', 'a', 'b', 'c']
    await subs.checkAll()
    await subs.checkAll()
    expect(downloaded).toEqual([['d']])

    const saved = JSON.parse(await readFile(join(dir, 'subs.json'), 'utf8'))
    expect(saved[0].seen).toContain('https://www.youtube.com/watch?v=d')
  })

  it('keeps the error of a failed check and refuses single videos', async () => {
    dir = await mkdtemp(join(tmpdir(), 'downly-subs-'))
    let fail = false
    const subs = new Subscriptions({
      file: join(dir, 'subs.json'),
      list: async (url) => {
        if (fail) throw new Error('offline')
        return url.includes('watch') ? ({ type: 'single' } as never) : channel(['a'])
      },
      download: async () => {}
    })
    await expect(subs.add('https://www.youtube.com/watch?v=x', 'video')).rejects.toThrow(/single video/)
    await subs.add('https://www.youtube.com/playlist?list=PL1', 'video')
    fail = true
    await subs.checkAll()
    expect(subs.list()[0].error).toBe('offline')
  })
})
