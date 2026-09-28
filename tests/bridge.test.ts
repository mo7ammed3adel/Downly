import { createServer, type Server } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import type { Settings } from '@shared/types'
import { createDefaultSettings } from '@shared/defaults'
import { BrowserBridge } from '../src/main/services/bridge'

const BASE = 47310

function settingsOn(port: number): () => Settings {
  const s = createDefaultSettings('/tmp', 'en')
  s.browserIntegration.port = port
  return () => s
}

const occupy = (port: number) =>
  new Promise<Server>((resolve) => {
    const s = createServer((_req, res) => res.end('someone else'))
    s.listen(port, '127.0.0.1', () => resolve(s))
  })

async function waitForPort(bridge: BrowserBridge): Promise<number> {
  for (let i = 0; i < 50 && !bridge.port; i++) await new Promise((r) => setTimeout(r, 20))
  return bridge.port
}

const ping = (port: number) => fetch(`http://127.0.0.1:${port}/ping`, { headers: { 'x-downly': '1' } }).then((r) => r.json())

describe('BrowserBridge port', () => {
  const cleanup: (() => void)[] = []
  afterEach(() => cleanup.splice(0).forEach((f) => f()))

  it('listens on the configured port when it is free', async () => {
    const bridge = new BrowserBridge(settingsOn(BASE), '1.0.0')
    bridge.apply()
    cleanup.push(() => bridge.stop())
    expect(await waitForPort(bridge)).toBe(BASE)
    expect((await ping(BASE)).app).toBe('Downly')
  })

  it('moves to the next free port when others are taken', async () => {
    const taken = [await occupy(BASE + 1), await occupy(BASE + 2)]
    cleanup.push(() => taken.forEach((s) => s.close()))
    const bridge = new BrowserBridge(settingsOn(BASE + 1), '1.0.0')
    bridge.apply()
    cleanup.push(() => bridge.stop())
    expect(await waitForPort(bridge)).toBe(BASE + 3)
    expect((await ping(BASE + 3)).app).toBe('Downly')
  })
})

describe('BrowserBridge upload', () => {
  const post = (port: number, path: string, body: BodyInit, type = 'application/octet-stream') =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'x-downly': '1', 'content-type': type }, body })

  it('joins the pieces in order and hands over the whole file', async () => {
    const port = BASE + 20
    const bridge = new BrowserBridge(settingsOn(port), '1.0.0')
    bridge.apply()
    await waitForPort(bridge)
    const got = new Promise<{ path: string; fileName: string; pageUrl?: string }>((r) => bridge.once('file', r))

    const id = 'test-upload-1'
    expect((await post(port, `/upload?id=${id}&offset=0`, 'hello ')).status).toBe(200)
    // A piece that skips ahead is refused
    expect((await post(port, `/upload?id=${id}&offset=99`, 'x')).status).toBe(409)
    expect((await post(port, `/upload?id=${id}&offset=6`, 'world')).status).toBe(200)
    const done = await post(port, '/upload/done', JSON.stringify({ id, fileName: 'a.txt', pageUrl: 'https://web.whatsapp.com/' }), 'application/json')
    expect(done.status).toBe(200)

    const file = await got
    expect(file.fileName).toBe('a.txt')
    expect(await readFile(file.path, 'utf8')).toBe('hello world')
    await rm(file.path, { force: true })
    bridge.stop()
  })
})

describe('BrowserBridge songs', () => {
  it('passes songs read off a music page and drops incomplete ones', async () => {
    const port = BASE + 30
    const bridge = new BrowserBridge(settingsOn(port), '1.0.0')
    bridge.apply()
    await waitForPort(bridge)
    const got = new Promise<{ tracks?: unknown[]; collection?: string }>((r) => bridge.once('add', r))
    await fetch(`http://127.0.0.1:${port}/media`, {
      method: 'POST',
      headers: { 'x-downly': '1', 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://play.anghami.com/album/1',
        collection: 'Album',
        tracks: [
          { title: 'Song', artist: 'Singer', durationMs: 200000, cover: 'javascript:alert(1)' },
          { title: 'No artist' }
        ]
      })
    })
    const req = await got
    expect(req.collection).toBe('Album')
    expect(req.tracks).toEqual([{ title: 'Song', artist: 'Singer', album: undefined, cover: undefined, durationMs: 200000 }])
    bridge.stop()
  })
})

describe('BrowserBridge outdated extension', () => {
  const hit = (port: number, headers: Record<string, string>) =>
    fetch(`http://127.0.0.1:${port}/log`, { method: 'POST', headers: { 'x-downly': '1', 'content-type': 'application/json', ...headers }, body: '{"text":"x"}' })

  it('flags an extension older than the app, or one that sends no version', async () => {
    for (const [headers, expected] of [
      [{}, 'old'],
      [{ 'x-downly-ext': '1.0.7' }, '1.0.7'],
      [{ 'x-downly-ext': '1.0.9' }, null]
    ] as const) {
      const port = BASE + 40
      const bridge = new BrowserBridge(settingsOn(port), '1.0.9')
      bridge.apply()
      await waitForPort(bridge)
      let flagged: string | null = null
      bridge.on('extension-outdated', (v: string) => (flagged = v))
      await hit(port, headers)
      expect(flagged).toBe(expected)
      bridge.stop()
      await new Promise((r) => setTimeout(r, 50))
    }
  })
})
