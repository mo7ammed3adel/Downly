import { EventEmitter } from 'node:events'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Category, DownloadItem, NewDownloadRequest, Settings } from '@shared/types'
import { categorize, extensionOf, mediaCategory, sanitizeFileName } from '@shared/util'
import { HttpDownload, partPath } from './HttpDownload'
import { buildHeaders, fileNameFrom, type ProxyResolver } from './http'
import { AbortError, isAbortError } from './errors'
import { SpeedLimiter } from './SpeedLimiter'
import { YtdlpDownload, type YtdlpEnv } from './ytdlp'

interface Task {
  stop(): void
}

export interface ManagerDeps {
  dataFile: string
  getSettings(): Settings
  proxyFor: ProxyResolver
  /** Resolves binaries/proxy for yt-dlp jobs (downloads yt-dlp on first use) */
  ytdlpEnv(url: string): Promise<YtdlpEnv>
}

const RUNTIME_FIELDS = new Set(['speed', 'eta', 'stage'])
const isActive = (i: DownloadItem) => i.status === 'downloading' || i.status === 'processing'

/**
 * Owns the download list: queueing, concurrency, persistence and live stats.
 * Events: 'changed' (items[]), 'removed' (ids[]), 'completed' (item), 'failed' (item), 'idle'.
 */
export class DownloadManager extends EventEmitter {
  private items = new Map<string, DownloadItem>()
  private tasks = new Map<string, Task>()
  private dirty = new Set<string>()
  private autoNamed = new Set<string>()
  private samples = new Map<string, { bytes: number; at: number }>()
  private saveTimer?: NodeJS.Timeout
  private flushTimer?: NodeJS.Timeout
  private statsTimer?: NodeJS.Timeout
  private hadWork = false
  readonly limiter = new SpeedLimiter()

  constructor(private deps: ManagerDeps) {
    super()
  }

  async load(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.deps.dataFile, 'utf8')) as DownloadItem[]
      for (const item of saved) {
        // Anything that was running when the app closed resumes as paused
        if (isActive(item) || item.status === 'queued') item.status = 'paused'
        item.speed = 0
        item.eta = -1
        item.stage = undefined
        this.items.set(item.id, item)
      }
    } catch {
      /* first run or corrupted file — start empty */
    }
    this.applySettings()
    this.statsTimer = setInterval(() => this.updateStats(), 1000)
  }

  list(): DownloadItem[] {
    return [...this.items.values()]
  }

  get(id: string): DownloadItem | undefined {
    return this.items.get(id)
  }

  applySettings(): void {
    const s = this.deps.getSettings()
    this.limiter.setRate(s.speedLimitEnabled ? s.speedLimitKBps * 1024 : 0)
    this.schedule()
  }

  async add(requests: NewDownloadRequest[]): Promise<DownloadItem[]> {
    const settings = this.deps.getSettings()
    const created: DownloadItem[] = []
    for (const req of requests) {
      const isMedia = req.kind !== 'http'
      let fileName = req.fileName ? sanitizeFileName(req.fileName) : ''
      if (!fileName) {
        if (isMedia) fileName = sanitizeFileName(req.title ?? 'media')
        else fileName = fileNameFrom(req.url)
      }
      const category: Category = isMedia ? mediaCategory(req.media?.mode) : categorize(fileName, settings.categories)
      const item: DownloadItem = {
        id: randomUUID(),
        kind: req.kind,
        url: req.url,
        pageUrl: req.pageUrl,
        referrer: req.referrer,
        headers: req.headers,
        cookies: req.cookies,
        fileName,
        directory: req.directory || this.dirFor(category),
        category,
        size: req.size ?? -1,
        downloaded: 0,
        status: req.startPaused ? 'paused' : 'queued',
        resumable: false,
        segments: [],
        createdAt: Date.now() + created.length,
        speed: 0,
        eta: -1,
        media: req.media,
        title: req.title,
        thumbnail: req.thumbnail,
        playlistTitle: req.playlistTitle,
        track: req.track
      }
      if (!req.fileName && !isMedia) this.autoNamed.add(item.id)
      if (!isMedia) item.fileName = await this.uniqueName(item.directory, item.fileName, item.id)
      this.items.set(item.id, item)
      this.markDirty(item)
      created.push(item)
    }
    this.schedule()
    return created
  }

  pause(ids: string[]): void {
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item) continue
      if (item.status === 'queued') {
        item.status = 'paused'
        this.markDirty(item)
      }
      this.tasks.get(id)?.stop()
    }
  }

  resume(ids: string[]): void {
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item || isActive(item) || item.status === 'completed') continue
      item.status = 'queued'
      item.error = undefined
      this.markDirty(item)
    }
    this.schedule()
  }

  pauseAll(): void {
    this.pause(this.list().filter((i) => i.status === 'queued' || isActive(i)).map((i) => i.id))
  }

  resumeAll(): void {
    this.resume(this.list().filter((i) => i.status === 'paused' || i.status === 'error').map((i) => i.id))
  }

  /** Re-download a finished/failed item from scratch */
  restart(ids: string[]): void {
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item || isActive(item)) continue
      item.segments = []
      item.downloaded = 0
      item.status = 'queued'
      item.error = undefined
      item.completedAt = undefined
      this.markDirty(item)
    }
    this.schedule()
  }

  /** IDM "refresh download address": swap an expired link but keep the progress */
  refreshUrl(id: string, url: string, headers?: { cookies?: string; referrer?: string }): void {
    const item = this.items.get(id)
    if (!item) return
    item.url = url
    if (headers?.cookies) item.cookies = headers.cookies
    if (headers?.referrer) item.referrer = headers.referrer
    item.error = undefined
    this.markDirty(item)
    if (!isActive(item)) this.resume([id])
  }

  async remove(ids: string[], deleteFiles: boolean): Promise<void> {
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item) continue
      this.items.delete(id)
      this.tasks.get(id)?.stop()
      this.tasks.delete(id)
      if (deleteFiles) {
        await rm(partPath(item), { force: true }).catch(() => {})
        if (item.status === 'completed') await rm(join(item.directory, item.fileName), { force: true }).catch(() => {})
      }
    }
    this.emit('removed', ids)
    this.scheduleSave()
    this.schedule()
  }

  clearCompleted(): Promise<void> {
    return this.remove(this.list().filter((i) => i.status === 'completed').map((i) => i.id), false)
  }

  get activeCount(): number {
    return this.tasks.size
  }

  get pendingCount(): number {
    return this.list().filter((i) => i.status === 'queued' || isActive(i)).length
  }

  async shutdown(): Promise<void> {
    clearInterval(this.statsTimer)
    for (const task of this.tasks.values()) task.stop()
    for (const item of this.items.values()) if (isActive(item) || item.status === 'queued') item.status = 'paused'
    await this.save()
  }

  /**
   * Adds a file that already exists in full (media the browser extension read out of a page,
   * e.g. WhatsApp's encrypted media) as a completed download in its category folder.
   */
  async importFile(tempPath: string, name: string, pageUrl?: string): Promise<DownloadItem> {
    const settings = this.deps.getSettings()
    const fileName = sanitizeFileName(name) || 'file'
    const category = categorize(fileName, settings.categories)
    const directory = this.dirFor(category)
    await mkdir(directory, { recursive: true })
    const id = randomUUID()
    const finalName = await this.uniqueName(directory, fileName, id)
    const target = join(directory, finalName)
    try {
      await rename(tempPath, target)
    } catch {
      // Temp folder on another drive
      await copyFile(tempPath, target)
      await rm(tempPath, { force: true })
    }
    const size = (await stat(target)).size
    const now = Date.now()
    const item: DownloadItem = {
      id,
      kind: 'http',
      url: pageUrl ?? '',
      pageUrl,
      fileName: finalName,
      directory,
      category,
      size,
      downloaded: size,
      status: 'completed',
      resumable: false,
      segments: [],
      createdAt: now,
      completedAt: now,
      speed: 0,
      eta: 0
    }
    this.items.set(id, item)
    this.markDirty(item)
    this.emit('completed', item)
    return item
  }

  // ---------------------------------------------------------------- internals

  private dirFor(category: Category): string {
    const s = this.deps.getSettings()
    return s.useCategoryFolders ? join(s.downloadDir, s.categories[category]?.folder ?? 'Other') : s.downloadDir
  }

  private async uniqueName(dir: string, name: string, selfId: string): Promise<string> {
    if (this.deps.getSettings().onFileExists === 'overwrite') return name
    const ext = extensionOf(name)
    const stem = ext ? name.slice(0, -(ext.length + 1)) : name
    const taken = (n: string) =>
      this.list().some((i) => i.id !== selfId && i.directory === dir && i.fileName === n && i.status !== 'completed')
    for (let n = 0; n < 10_000; n++) {
      const candidate = n === 0 ? name : `${stem} (${n})${ext ? `.${ext}` : ''}`
      const onDisk = await stat(join(dir, candidate)).then(() => true, () => false)
      if (!onDisk && !taken(candidate)) return candidate
    }
    return `${stem}-${Date.now()}${ext ? `.${ext}` : ''}`
  }

  private schedule(): void {
    const s = this.deps.getSettings()
    const limit = Math.max(1, s.maxConcurrent)
    const queued = this.list()
      .filter((i) => i.status === 'queued' && !this.tasks.has(i.id))
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const item of queued) {
      if (this.tasks.size >= limit) break
      void this.run(item)
    }
    if (this.hadWork && this.tasks.size === 0 && this.pendingCount === 0) {
      this.hadWork = false
      this.emit('idle')
    }
  }

  private async run(item: DownloadItem): Promise<void> {
    this.hadWork = true
    item.status = 'downloading'
    item.error = undefined
    item.stage = undefined
    this.markDirty(item)
    const onProgress = () => this.markDirty(item)
    let task: HttpDownload | YtdlpDownload | undefined
    // Reserve the slot before any await so schedule() doesn't over-start
    const placeholder: Task = {
      stop: () => {
        if (task) task.stop()
        else item.status = 'paused'
      }
    }
    this.tasks.set(item.id, placeholder)

    try {
      await mkdir(item.directory, { recursive: true })
      if (item.kind === 'http') {
        task = this.httpTask(item, onProgress)
      } else {
        const env = await this.deps.ytdlpEnv(item.url)
        const s = this.deps.getSettings()
        const perJobLimit = this.limiter.limited ? s.speedLimitKBps / Math.max(1, this.tasks.size) : 0
        task = new YtdlpDownload(item, env, {
          rateLimitKBps: perJobLimit,
          onProgress
        })
      }
      // The user may have paused while we were still preparing (status is mutated elsewhere)
      if ((item.status as DownloadItem['status']) === 'paused') throw new AbortError()
      await task.start()
      if (!this.items.has(item.id)) return
      item.status = 'completed'
      item.completedAt = Date.now()
      item.speed = 0
      item.eta = 0
      item.stage = undefined
      item.segments = []
      if (item.size > 0) item.downloaded = item.size
      item.category = item.kind === 'http' ? item.category : categorize(item.fileName, this.deps.getSettings().categories)
      this.emit('completed', item)
    } catch (err) {
      if (!this.items.has(item.id)) return
      item.speed = 0
      item.eta = -1
      item.stage = undefined
      if (isAbortError(err)) {
        item.status = 'paused'
      } else {
        item.status = 'error'
        item.error = err instanceof Error ? err.message : String(err)
        this.emit('failed', item)
      }
    } finally {
      this.tasks.delete(item.id)
      this.samples.delete(item.id)
      this.markDirty(item)
      this.scheduleSave()
      this.schedule()
    }
  }

  private httpTask(item: DownloadItem, onProgress: () => void): HttpDownload {
    const s = this.deps.getSettings()
    return new HttpDownload(item, {
      connections: Math.max(1, Math.min(32, s.connectionsPerDownload)),
      maxRetries: s.maxRetries,
      limiter: this.limiter,
      request: {
        headers: buildHeaders(s.userAgent, item.headers, item.cookies, item.referrer),
        timeoutMs: s.timeoutSec * 1000,
        proxyFor: this.deps.proxyFor
      },
      onMeta: async (meta) => {
        if (this.autoNamed.has(item.id) && meta.fileName) {
          this.autoNamed.delete(item.id)
          const cat = categorize(meta.fileName, s.categories)
          if (cat !== item.category && item.directory === this.dirFor(item.category)) {
            item.directory = this.dirFor(cat)
            await mkdir(item.directory, { recursive: true })
          }
          item.category = cat
          item.fileName = await this.uniqueName(item.directory, meta.fileName, item.id)
        }
      },
      onProgress
    })
  }

  private updateStats(): void {
    const now = Date.now()
    for (const item of this.items.values()) {
      if (item.status !== 'downloading' || item.kind !== 'http') continue
      const prev = this.samples.get(item.id)
      this.samples.set(item.id, { bytes: item.downloaded, at: now })
      if (!prev) continue
      const instant = ((item.downloaded - prev.bytes) * 1000) / Math.max(1, now - prev.at)
      // Exponential smoothing keeps the speed readout from jumping around
      item.speed = item.speed ? item.speed * 0.6 + instant * 0.4 : instant
      item.eta = item.size > 0 && item.speed > 1 ? (item.size - item.downloaded) / item.speed : -1
      this.markDirty(item)
    }
  }

  private markDirty(item: DownloadItem): void {
    this.dirty.add(item.id)
    this.flushTimer ??= setTimeout(() => this.flush(), 300)
  }

  private flush(): void {
    this.flushTimer = undefined
    const changed = [...this.dirty].map((id) => this.items.get(id)).filter(Boolean) as DownloadItem[]
    this.dirty.clear()
    if (changed.length) this.emit('changed', changed)
    this.scheduleSave()
  }

  private scheduleSave(): void {
    this.saveTimer ??= setTimeout(() => {
      this.saveTimer = undefined
      void this.save()
    }, 2000)
  }

  private async save(): Promise<void> {
    const data = JSON.stringify(this.list(), (k, v) => (RUNTIME_FIELDS.has(k) ? undefined : v))
    const tmp = `${this.deps.dataFile}.tmp`
    try {
      await writeFile(tmp, data)
      await rename(tmp, this.deps.dataFile)
    } catch {
      /* disk full / locked — next save retries */
    }
  }
}
