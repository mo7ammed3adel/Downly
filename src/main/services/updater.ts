import { EventEmitter } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateState } from '@shared/types'
import { discard, httpGet, type Fetcher, type ProxyResolver } from '../engine/http'

const RELEASES_API = 'https://api.github.com/repos/mo7ammed3adel/downly-releases/releases/latest'
export const DOWNLOAD_PAGE = 'https://downly-app.vercel.app/#download'
const DOWNLOAD_ATTEMPTS = 4
const RETRY_DELAY_MS = 3000

import { isNewer } from '@shared/util'
export { isNewer }

/**
 * The installer that replaces this copy in place, or null where the app can't update itself:
 * macOS won't auto-update apps without a paid Apple signature, Linux packages belong to the
 * package manager, and the Microsoft Store updates its own copy.
 */
export function installerFor(platform: string, electronVersion: string, arch: string, windowsStore: boolean): string | null {
  if (platform !== 'win32' || windowsStore) return null
  // The Windows 7/8 builds run Electron 22
  if (electronVersion.startsWith('22.')) return arch === 'ia32' ? 'Downly-Setup-Win7-x86.exe' : 'Downly-Setup-Win7-x64.exe'
  return 'Downly-Setup.exe'
}

interface Release {
  tag_name: string
  draft?: boolean
  prerelease?: boolean
  assets: { name: string; browser_download_url: string; size: number }[]
}

interface UpdaterDeps {
  currentVersion: string
  /** Installer asset name for this copy, null when it can only point to the website */
  installer: string | null
  fetch: Fetcher
  proxyFor: ProxyResolver
  /** Runs the downloaded installer and closes the app */
  runInstaller(path: string): void
}

/**
 * Checks the public releases for a newer version. On Windows it downloads the matching
 * installer and runs it silently (the app restarts by itself); elsewhere the UI links to the
 * website. Events: 'state' (UpdateState).
 */
export class Updater extends EventEmitter {
  state: UpdateState = { status: 'idle' }
  private asset?: Release['assets'][number]

  constructor(private deps: UpdaterDeps) {
    super()
  }

  async check(): Promise<UpdateState> {
    if (this.state.status === 'downloading') return this.state
    try {
      const res = await this.deps.fetch(RELEASES_API, { headers: { accept: 'application/vnd.github+json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const release = await res.json<Release>()
      const version = release.tag_name.replace(/^v/, '')
      if (release.draft || release.prerelease || !isNewer(version, this.deps.currentVersion)) {
        return this.set({ status: 'latest' })
      }
      this.asset = release.assets.find((a) => a.name === this.deps.installer)
      return this.set({ status: 'available', version, canInstall: !!this.asset })
    } catch (err) {
      return this.set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Downloads the installer next to the temp folder, then hands it to runInstaller */
  async install(): Promise<void> {
    const asset = this.asset
    if (!asset || this.state.status !== 'available') return
    const version = this.state.version
    this.set({ status: 'downloading', version, progress: 0 })
    try {
      const dir = join(tmpdir(), 'downly-update')
      await mkdir(dir, { recursive: true })
      const target = join(dir, asset.name)
      const part = `${target}.part`
      await rm(part, { force: true })
      // Connections drop (flaky Wi-Fi, a moment without DNS): retry, carrying on from what arrived
      for (let attempt = 1; ; attempt++) {
        try {
          await this.fetchInto(asset, part, version)
          break
        } catch (err) {
          if (attempt >= DOWNLOAD_ATTEMPTS) throw err
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt))
        }
      }
      await rm(target, { force: true })
      await rename(part, target)
      this.set({ status: 'installing', version })
      this.deps.runInstaller(target)
    } catch (err) {
      this.set({ status: 'available', version, canInstall: true, error: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Appends the rest of the installer to `part` (asks for a range when some already arrived) */
  private async fetchInto(asset: Release['assets'][number], part: string, version: string): Promise<void> {
    const have = (await stat(part).catch(() => null))?.size ?? 0
    const res = await httpGet(
      asset.browser_download_url,
      { headers: { 'user-agent': 'Downly' }, timeoutMs: 60_000, proxyFor: this.deps.proxyFor },
      have > 0 ? `bytes=${have}-` : undefined
    )
    const resumed = have > 0 && res.statusCode === 206
    if (res.statusCode !== 200 && !resumed) {
      discard(res.body)
      throw new Error(`HTTP ${res.statusCode}`)
    }
    let received = resumed ? have : 0
    let shown = -1
    const progress = new Transform({
      transform: (chunk: Buffer, _enc, done) => {
        received += chunk.length
        const pct = asset.size ? Math.floor((received / asset.size) * 100) : 0
        if (pct !== shown) this.set({ status: 'downloading', version, progress: (shown = pct) })
        done(null, chunk)
      }
    })
    await pipeline(res.body, progress, createWriteStream(part, { flags: resumed ? 'a' : 'w' }))
    if (asset.size && received !== asset.size) throw new Error('The download was incomplete')
  }

  private set(state: UpdateState): UpdateState {
    this.state = state
    this.emit('state', state)
    return state
  }
}
