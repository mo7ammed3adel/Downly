import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { UpdateState } from '@shared/types'
import type { Fetcher } from '../src/main/engine/http'
import { installerFor, isNewer, Updater } from '../src/main/services/updater'

describe('isNewer', () => {
  it('compares versions number by number', () => {
    expect(isNewer('1.0.10', '1.0.9')).toBe(true)
    expect(isNewer('v1.1.0', '1.0.9')).toBe(true)
    expect(isNewer('1.0.5', '1.0.5')).toBe(false)
    expect(isNewer('1.0.4', '1.0.5')).toBe(false)
  })
})

describe('installerFor', () => {
  it('picks the installer matching this build', () => {
    expect(installerFor('win32', '38.8.6', 'x64', false)).toBe('Downly-Setup.exe')
    expect(installerFor('win32', '22.3.27', 'x64', false)).toBe('Downly-Setup-Win7-x64.exe')
    expect(installerFor('win32', '22.3.27', 'ia32', false)).toBe('Downly-Setup-Win7-x86.exe')
  })
  it('leaves the Store copy, macOS and Linux to other channels', () => {
    expect(installerFor('win32', '38.8.6', 'x64', true)).toBeNull()
    expect(installerFor('darwin', '38.8.6', 'arm64', false)).toBeNull()
    expect(installerFor('linux', '38.8.6', 'x64', false)).toBeNull()
  })
})

describe('Updater', () => {
  let server: Server | undefined
  afterEach(() => server?.close())

  const INSTALLER = Buffer.alloc(150_000, 9)
  const release = (base: string, tag: string) => ({
    tag_name: tag,
    assets: [{ name: 'Downly-Setup.exe', browser_download_url: `${base}/Downly-Setup.exe`, size: INSTALLER.length }]
  })

  async function serve(): Promise<string> {
    server = createServer((req, res) => res.end(req.url === '/Downly-Setup.exe' ? INSTALLER : ''))
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
  }
  const fakeFetch =
    (body: unknown): Fetcher =>
    async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async <T>() => body as T })

  it('reports the latest version when nothing newer is out', async () => {
    const updater = new Updater({
      currentVersion: '1.0.5',
      installer: 'Downly-Setup.exe',
      fetch: fakeFetch(release('http://x', 'v1.0.5')),
      proxyFor: async () => undefined,
      runInstaller: () => {}
    })
    expect(await updater.check()).toEqual({ status: 'latest' })
  })

  it('downloads the newer installer with progress and hands it over', async () => {
    const base = await serve()
    let ranWith = ''
    const updater = new Updater({
      currentVersion: '1.0.5',
      installer: 'Downly-Setup.exe',
      fetch: fakeFetch(release(base, 'v1.0.6')),
      proxyFor: async () => undefined,
      runInstaller: (path) => (ranWith = path)
    })
    const states: UpdateState[] = []
    updater.on('state', (s: UpdateState) => states.push(s))

    expect(await updater.check()).toEqual({ status: 'available', version: '1.0.6', canInstall: true })
    await updater.install()

    expect(states.some((s) => s.status === 'downloading' && s.progress > 0)).toBe(true)
    expect(updater.state).toEqual({ status: 'installing', version: '1.0.6' })
    expect(await readFile(ranWith)).toEqual(INSTALLER)
  })

  it('points to the website when this copy has no installer', async () => {
    const updater = new Updater({
      currentVersion: '1.0.5',
      installer: null,
      fetch: fakeFetch(release('http://x', 'v1.0.6')),
      proxyFor: async () => undefined,
      runInstaller: () => {}
    })
    expect(await updater.check()).toEqual({ status: 'available', version: '1.0.6', canInstall: false })
  })
})
