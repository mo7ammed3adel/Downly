import { open, rename, rm, stat, type FileHandle } from 'node:fs/promises'
import type { DownloadItem, Segment } from '@shared/types'
import { discard, HttpError, httpGet, probe, type ProbeInfo, type RequestOptions } from './http'
import type { SpeedLimiter } from './SpeedLimiter'
import { AbortError } from './errors'

const MIN_SEGMENT = 512 * 1024
/** A running segment is only split when at least this much is left in it */
const MIN_SPLIT = 1024 * 1024

export interface HttpTaskContext {
  connections: number
  maxRetries: number
  limiter: SpeedLimiter
  request: Omit<RequestOptions, 'signal'>
  /** Called once the server metadata is known so the manager can fix the name/path */
  onMeta(meta: ProbeInfo): Promise<void>
  onProgress(): void
}

class RangeUnsupported extends Error {}

export const partPath = (item: DownloadItem) => `${item.directory}/${item.fileName}.sgpart`

const remaining = (s: Segment) => (s.end < 0 ? Infinity : s.end - s.start + 1 - s.downloaded)

/**
 * IDM-style segmented download: the file is split into ranges fetched in parallel,
 * and whenever a connection finishes it steals half of the biggest remaining range.
 * Progress lives in `item.segments`, so a paused/crashed download resumes where it stopped.
 */
export class HttpDownload {
  private controller: AbortController = new AbortController()
  private file?: FileHandle
  private workers = new Set<Promise<void>>()
  private active = new Set<Segment>()
  private failure?: unknown

  constructor(
    private item: DownloadItem,
    private ctx: HttpTaskContext
  ) {}

  private stoppedByUser = false

  stop(): void {
    this.stoppedByUser = true
    this.controller.abort()
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  async start(): Promise<void> {
    try {
      await this.run()
    } catch (err) {
      if (!(err instanceof RangeUnsupported) || this.stoppedByUser) throw err
      // Server lied about ranges: fall back to a single fresh connection
      await this.closeFile()
      this.item.resumable = false
      this.item.segments = []
      this.item.downloaded = 0
      this.failure = undefined
      this.controller = new AbortController()
      await this.run()
    } finally {
      await this.closeFile()
    }
  }

  private async closeFile(): Promise<void> {
    await this.file?.close().catch(() => {})
    this.file = undefined
  }

  private async run(): Promise<void> {
    const item = this.item
    const partExists = await stat(partPath(item)).then(() => true, () => false)
    const fresh = item.segments.length === 0 || !item.resumable || !partExists
    if (fresh) {
      const meta = await probe(item.url, { ...this.ctx.request, signal: this.signal })
      await this.ctx.onMeta(meta)
      item.size = meta.size
      item.resumable = meta.resumable && meta.size > 0
      item.segments = this.initialSegments()
      item.downloaded = 0
    } else {
      item.downloaded = item.segments.reduce((sum, s) => sum + s.downloaded, 0)
    }

    // onMeta may have renamed the file, so re-derive the path
    const path = partPath(item)
    this.file = await open(path, fresh ? 'w' : 'r+')
    if (item.size > 0 && fresh) await this.file.truncate(item.size)

    for (const seg of item.segments) if (remaining(seg) > 0) this.spawn(seg)
    while (this.workers.size) await Promise.race(this.workers)

    if (this.failure) throw this.failure
    if (this.signal.aborted) throw new AbortError()
    if (item.size > 0 && item.downloaded < item.size) throw new Error('Download incomplete')

    await this.file.close()
    this.file = undefined
    await rename(path, `${item.directory}/${item.fileName}`).catch(async (err) => {
      // Target got created meanwhile (overwrite mode) — replace it
      await rm(`${item.directory}/${item.fileName}`, { force: true })
      await rename(path, `${item.directory}/${item.fileName}`).catch(() => {
        throw err
      })
    })
    if (item.size < 0) item.size = item.downloaded
  }

  private initialSegments(): Segment[] {
    const { size, resumable } = this.item
    if (!resumable || size <= 0) return [{ start: 0, end: size > 0 ? size - 1 : -1, downloaded: 0 }]
    const count = Math.max(1, Math.min(this.ctx.connections, Math.floor(size / MIN_SEGMENT)))
    const chunk = Math.ceil(size / count)
    const segs: Segment[] = []
    for (let start = 0; start < size; start += chunk) {
      segs.push({ start, end: Math.min(size, start + chunk) - 1, downloaded: 0 })
    }
    return segs
  }

  private spawn(seg: Segment): void {
    this.active.add(seg)
    const p = this.worker(seg)
      .catch((err) => {
        if (!this.signal.aborted) {
          this.failure ??= err
          this.controller.abort()
        }
      })
      .finally(() => {
        this.active.delete(seg)
        this.workers.delete(p)
        if (!this.signal.aborted && !this.failure) this.rebalance()
      })
    this.workers.add(p)
  }

  /** Dynamic segmentation: give idle connection slots half of the largest running range */
  private rebalance(): void {
    if (!this.item.resumable) return
    while (this.active.size < this.ctx.connections) {
      let biggest: Segment | undefined
      for (const s of this.active) if (!biggest || remaining(s) > remaining(biggest)) biggest = s
      if (!biggest || remaining(biggest) < MIN_SPLIT * 2) return
      const pos = biggest.start + biggest.downloaded
      const mid = pos + Math.floor((biggest.end - pos) / 2)
      const next: Segment = { start: mid + 1, end: biggest.end, downloaded: 0 }
      biggest.end = mid
      this.item.segments.push(next)
      this.item.segments.sort((a, b) => a.start - b.start)
      this.spawn(next)
    }
  }

  private async worker(seg: Segment): Promise<void> {
    let attempt = 0
    while (remaining(seg) > 0 && !this.signal.aborted) {
      try {
        await this.fetchRange(seg)
        attempt = 0
      } catch (err) {
        if (this.signal.aborted) return
        if (err instanceof RangeUnsupported) throw err
        if (err instanceof HttpError && err.fatal) throw err
        if (++attempt > this.ctx.maxRetries) throw err
        if (!this.item.resumable) {
          // Can't continue mid-file without ranges: restart from zero
          this.item.downloaded -= seg.downloaded
          seg.downloaded = 0
        }
        await new Promise((r) => setTimeout(r, Math.min(15_000, 1000 * 2 ** (attempt - 1))))
      }
    }
  }

  private async fetchRange(seg: Segment): Promise<void> {
    const pos = seg.start + seg.downloaded
    const range = this.item.resumable ? `bytes=${pos}-${seg.end}` : undefined
    const res = await httpGet(this.item.url, { ...this.ctx.request, signal: this.signal }, range)
    if (res.statusCode >= 400) {
      discard(res.body)
      throw new HttpError(res.statusCode, `HTTP ${res.statusCode}`)
    }
    if (range && res.statusCode !== 206) {
      if (pos === 0 && this.item.segments.length === 1) {
        // Full body from byte 0 — usable as-is, just not resumable
        this.item.resumable = false
      } else {
        discard(res.body)
        throw new RangeUnsupported('Server ignored range request')
      }
    }

    try {
      for await (const raw of res.body) {
        let chunk = raw as Buffer
        const left = remaining(seg)
        if (left <= 0) break
        if (chunk.length > left) chunk = chunk.subarray(0, left)
        await this.file!.write(chunk, 0, chunk.length, seg.start + seg.downloaded)
        seg.downloaded += chunk.length
        this.item.downloaded += chunk.length
        this.ctx.onProgress()
        await this.ctx.limiter.consume(chunk.length, this.signal)
        // Another worker may have taken over the tail of this range
        if (remaining(seg) <= 0) break
      }
    } finally {
      discard(res.body)
    }

    if (seg.end < 0) {
      // Unknown size: stream ended means we're done
      seg.end = seg.start + seg.downloaded - 1
    } else if (remaining(seg) > 0 && !this.signal.aborted) {
      throw new Error('Connection closed early')
    }
  }
}
