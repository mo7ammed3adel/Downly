import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import type { MediaInfo, PlaylistEntry, PlaylistInfo, Subscription } from '@shared/types'

/** How many of a channel's newest videos each check looks at (channels list newest first) */
const CHANNEL_WINDOW = 50
/** Remembered video ids per subscription (old ones fall off) */
const MAX_SEEN = 5000

interface SubscriptionsDeps {
  file: string
  /** Lists a channel/playlist without downloading (yt-dlp --flat-playlist) */
  list(url: string, extraArgs: string[]): Promise<MediaInfo | PlaylistInfo>
  /** Queues the new videos of a subscription */
  download(sub: Subscription, entries: PlaylistEntry[]): Promise<void>
}

/** YouTube channel pages: the "Videos" tab holds the uploads, newest first */
export function normalizeChannelUrl(url: string): string {
  const u = new URL(url)
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) return url
  const channel = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.exec(u.pathname)
  if (channel) u.pathname = `/${channel[1]}/videos`
  return u.href
}

const isChannel = (url: string) => /youtube\.com\/(@|channel\/|c\/|user\/)/.test(url)

/**
 * Channels and playlists whose new videos download by themselves. Adding one only records what
 * is already there, so following a channel doesn't pull its whole history.
 * Events: 'changed' (Subscription[]), 'downloaded' ({ sub, count }).
 */
export class Subscriptions extends EventEmitter {
  private subs: Subscription[] = []
  private checking?: Promise<void>

  constructor(private deps: SubscriptionsDeps) {
    super()
  }

  async load(): Promise<void> {
    try {
      this.subs = JSON.parse(await readFile(this.deps.file, 'utf8'))
    } catch {
      this.subs = []
    }
  }

  list(): Subscription[] {
    return this.subs
  }

  async add(rawUrl: string, mode: 'video' | 'audio'): Promise<Subscription> {
    const url = normalizeChannelUrl(rawUrl.trim())
    if (this.subs.some((s) => s.url === url)) throw new Error('Already followed')
    const info = await this.fetch(url)
    const sub: Subscription = {
      id: randomUUID(),
      url,
      title: info.title,
      mode,
      seen: info.entries.map((e) => e.url).slice(-MAX_SEEN),
      addedAt: Date.now(),
      lastChecked: Date.now()
    }
    this.subs.push(sub)
    await this.changed()
    return sub
  }

  async remove(id: string): Promise<void> {
    this.subs = this.subs.filter((s) => s.id !== id)
    await this.changed()
  }

  /** Looks for new videos on every subscription (one run at a time) */
  checkAll(): Promise<void> {
    this.checking ??= this.runChecks().finally(() => (this.checking = undefined))
    return this.checking
  }

  private async runChecks(): Promise<void> {
    for (const sub of [...this.subs]) {
      try {
        const info = await this.fetch(sub.url)
        const seen = new Set(sub.seen)
        const fresh = info.entries.filter((e) => !seen.has(e.url))
        sub.lastChecked = Date.now()
        sub.error = undefined
        if (fresh.length) {
          await this.deps.download(sub, fresh)
          sub.seen = [...sub.seen, ...fresh.map((e) => e.url)].slice(-MAX_SEEN)
          this.emit('downloaded', { sub, count: fresh.length })
        }
      } catch (err) {
        sub.lastChecked = Date.now()
        sub.error = err instanceof Error ? err.message : String(err)
      }
      await this.changed()
    }
  }

  private async fetch(url: string): Promise<PlaylistInfo> {
    const info = await this.deps.list(url, isChannel(url) ? ['--playlist-end', String(CHANNEL_WINDOW)] : [])
    if (info.type !== 'playlist') throw new Error('This link is a single video, not a channel or playlist')
    return info
  }

  private async changed(): Promise<void> {
    this.emit('changed', this.subs)
    const tmp = `${this.deps.file}.tmp`
    await writeFile(tmp, JSON.stringify(this.subs))
    await rename(tmp, this.deps.file)
  }
}
