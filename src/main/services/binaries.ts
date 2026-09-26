import { app } from 'electron'
import { execFile } from 'node:child_process'
import { chmod, mkdir, rename, rm, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { EventEmitter } from 'node:events'
import type { ComponentsState } from '@shared/types'
import { httpGet, type ProxyResolver } from '../engine/http'
import { ytdlpDownloadUrl } from './ytdlpBuilds'

const UPDATE_EVERY_MS = 3 * 24 * 3600 * 1000

function run(file: string, args: string[], timeout = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr?.trim() || err.message)) : resolve(stdout.trim())
    )
  })
}

/**
 * Keeps yt-dlp (downloaded on first run, self-updated every few days — sites change
 * constantly so a bundled copy goes stale) and ffmpeg (bundled via ffmpeg-static).
 */
export class Binaries extends EventEmitter {
  readonly dir = join(app.getPath('userData'), 'bin')
  readonly ytdlpPath = join(this.dir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  state: ComponentsState = { ytdlp: { ready: false, busy: false }, ffmpeg: { ready: false } }
  private lastUpdateCheck = 0
  private ensuring?: Promise<void>
  private helpText?: string

  constructor(private proxyFor: ProxyResolver) {
    super()
  }

  get ffmpegPath(): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const p = require('ffmpeg-static') as string | null
      return p ? p.replace('app.asar', 'app.asar.unpacked') : null
    } catch {
      return null
    }
  }

  async init(): Promise<void> {
    const ff = this.ffmpegPath
    this.state.ffmpeg.ready = !!ff && (await stat(ff).then(() => true, () => false))
    const exists = await stat(this.ytdlpPath).then(() => true, () => false)
    if (exists) {
      this.state.ytdlp.version = await run(this.ytdlpPath, ['--version']).catch(() => undefined)
      this.state.ytdlp.ready = !!this.state.ytdlp.version
    }
    this.emitState()
    // Fetch in the background; media features wait on ensureYtdlp()
    this.ensureYtdlp().catch(() => {})
  }

  ensureYtdlp(): Promise<void> {
    if (this.state.ytdlp.ready) {
      if (Date.now() - this.lastUpdateCheck > UPDATE_EVERY_MS) this.update().catch(() => {})
      return Promise.resolve()
    }
    this.ensuring ??= this.download().finally(() => (this.ensuring = undefined))
    return this.ensuring
  }

  /** Whether the installed yt-dlp understands an option (new flags appear often) */
  async supports(flag: string): Promise<boolean> {
    this.helpText ??= await run(this.ytdlpPath, ['--help']).catch(() => '')
    return this.helpText.includes(flag)
  }

  async update(): Promise<void> {
    this.lastUpdateCheck = Date.now()
    this.setBusy(true)
    try {
      await run(this.ytdlpPath, ['-U'], 180_000)
      this.state.ytdlp.version = await run(this.ytdlpPath, ['--version'])
      this.helpText = undefined
    } catch (err) {
      // Self-update is unavailable for some builds — re-download instead
      await this.download().catch(() => {})
      this.state.ytdlp.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.setBusy(false)
    }
  }

  private async download(): Promise<void> {
    const url = ytdlpDownloadUrl()
    if (!url) throw new Error(`Unsupported platform ${process.platform}`)
    this.setBusy(true)
    try {
      await mkdir(this.dir, { recursive: true })
      const res = await httpGet(url, { headers: { 'user-agent': 'Downly' }, timeoutMs: 60_000, proxyFor: this.proxyFor })
      if (res.statusCode !== 200) throw new Error(`yt-dlp download failed: HTTP ${res.statusCode}`)
      const tmp = `${this.ytdlpPath}.tmp`
      await pipeline(res.body, createWriteStream(tmp))
      if (process.platform !== 'win32') await chmod(tmp, 0o755)
      await rm(this.ytdlpPath, { force: true })
      await rename(tmp, this.ytdlpPath)
      this.state.ytdlp.version = await run(this.ytdlpPath, ['--version'])
      this.state.ytdlp.ready = true
      this.state.ytdlp.error = undefined
      this.lastUpdateCheck = Date.now()
      this.helpText = undefined
    } catch (err) {
      this.state.ytdlp.error = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      this.setBusy(false)
    }
  }

  private setBusy(busy: boolean): void {
    this.state.ytdlp.busy = busy
    this.emitState()
  }

  private emitState(): void {
    this.emit('state', this.state)
  }
}
