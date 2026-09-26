import { EventEmitter } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateState } from '@shared/types'
import { httpGet, type Fetcher, type ProxyResolver } from '../engine/http'

const RELEASES_API = 'https://api.github.com/repos/mo7ammed3adel/downly-releases/releases/latest'
export const DOWNLOAD_PAGE = 'https://downly-app.vercel.app/#download'

/** "1.0.10" > "1.0.9" */
export function isNewer(candidate: string, current: string): boolean {
  const [a, b] = [candidate, current].map((v) => v.replace(/^v/, '').split('.').map(Number))
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  return false
}

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
      const res = await httpGet(asset.browser_download_url, { headers: { 'user-agent': 'Downly' }, timeoutMs: 60_000, proxyFor: this.deps.proxyFor })
      if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`)
      let received = 0
      let shown = 0
      const progress = new Transform({
        transform: (chunk: Buffer, _enc, done) => {
          received += chunk.length
          const pct = asset.size ? Math.floor((received / asset.size) * 100) : 0
          if (pct !== shown) this.set({ status: 'downloading', version, progress: (shown = pct) })
          done(null, chunk)
        }
      })
      await pipeline(res.body, progress, createWriteStream(`${target}.part`))
      if (asset.size && received !== asset.size) throw new Error('The download was incomplete')
      await rm(target, { force: true })
      await rename(`${target}.part`, target)
      this.set({ status: 'installing', version })
      this.deps.runInstaller(target)
    } catch (err) {
      this.set({ status: 'available', version, canInstall: true, error: err instanceof Error ? err.message : String(err) })
    }
  }

  private set(state: UpdateState): UpdateState {
    this.state = state
    this.emit('state', state)
    return state
  }
}
