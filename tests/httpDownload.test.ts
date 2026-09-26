import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { DownloadItem } from '@shared/types'
import { HttpDownload, partPath, type HttpTaskContext } from '../src/main/engine/HttpDownload'
import { directConnection } from '../src/main/engine/http'
import { SpeedLimiter } from '../src/main/engine/SpeedLimiter'

const PAYLOAD = randomBytes(6 * 1024 * 1024 + 123)
const ranges: string[] = []
let server: Server
let base = ''
let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sg-test-'))
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x')
    if (url.pathname === '/missing') {
      res.statusCode = 404
      return res.end()
    }
    const slow = url.pathname === '/slow'
    const noRange = url.pathname === '/norange'
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
    res.setHeader('content-disposition', 'attachment; filename="payload.bin"')
    let body = PAYLOAD
    if (range && !noRange) {
      ranges.push(req.headers.range!)
      const start = Number(range[1])
      const end = range[2] ? Number(range[2]) : PAYLOAD.length - 1
      body = PAYLOAD.subarray(start, end + 1)
      res.statusCode = 206
      res.setHeader('content-range', `bytes ${start}-${end}/${PAYLOAD.length}`)
      res.setHeader('accept-ranges', 'bytes')
    }
    res.setHeader('content-length', body.length)
    if (!slow) return res.end(body)
    // Trickle so the test can pause mid-download
    let off = 0
    const tick = setInterval(() => {
      if (res.destroyed || off >= body.length) {
        clearInterval(tick)
        return res.end()
      }
      res.write(body.subarray(off, off + 16 * 1024))
      off += 16 * 1024
    }, 10)
    res.on('close', () => clearInterval(tick))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.close()
  await rm(dir, { recursive: true, force: true })
})

function newItem(path: string, fileName: string): DownloadItem {
  return {
    id: fileName,
    kind: 'http',
    url: `${base}${path}`,
    fileName,
    directory: dir,
    category: 'other',
    size: -1,
    downloaded: 0,
    status: 'downloading',
    resumable: false,
    segments: [],
    createdAt: Date.now(),
    speed: 0,
    eta: -1
  }
}

function ctx(connections = 4): HttpTaskContext {
  return {
    connections,
    maxRetries: 2,
    limiter: new SpeedLimiter(0),
    request: { headers: { 'user-agent': 'test' }, timeoutMs: 10_000, proxyFor: directConnection },
    onMeta: async () => {},
    onProgress: () => {}
  }
}

describe('HttpDownload', () => {
  it('downloads with several connections and produces an identical file', async () => {
    ranges.length = 0
    const item = newItem('/file', 'multi.bin')
    await new HttpDownload(item, ctx(4)).start()
    const data = await readFile(join(dir, 'multi.bin'))
    expect(data.equals(PAYLOAD)).toBe(true)
    expect(item.resumable).toBe(true)
    // 1 probe + at least 4 parallel ranges
    expect(ranges.length).toBeGreaterThanOrEqual(5)
    await expect(stat(partPath(item))).rejects.toThrow()
  })

  it('falls back to one connection when the server ignores ranges', async () => {
    const item = newItem('/norange', 'single.bin')
    await new HttpDownload(item, ctx(8)).start()
    expect(item.resumable).toBe(false)
    expect((await readFile(join(dir, 'single.bin'))).equals(PAYLOAD)).toBe(true)
  })

  it('pauses and resumes from where it stopped', async () => {
    const item = newItem('/slow', 'resume.bin')
    const first = new HttpDownload(item, ctx(4))
    const run = first.start()
    await new Promise((r) => setTimeout(r, 250))
    first.stop()
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    const doneBefore = item.downloaded
    expect(doneBefore).toBeGreaterThan(0)
    expect(doneBefore).toBeLessThan(PAYLOAD.length)

    ranges.length = 0
    await new HttpDownload(item, ctx(4)).start()
    expect((await readFile(join(dir, 'resume.bin'))).equals(PAYLOAD)).toBe(true)
    // Resumed requests continue mid-file instead of restarting at byte 0
    expect(ranges.every((r) => r !== 'bytes=0-0')).toBe(true)
    expect(ranges.some((r) => !r.startsWith('bytes=0-'))).toBe(true)
  })

  it('fails fast on 404 instead of retrying', async () => {
    const item = newItem('/missing', 'missing.bin')
    const started = Date.now()
    await expect(new HttpDownload(item, ctx()).start()).rejects.toMatchObject({ status: 404 })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('downloads through an HTTP proxy', async () => {
    let proxied = 0
    // Minimal forward proxy: receives absolute URLs and relays them
    const proxy = createServer((req, res) => {
      proxied++
      const upstream = request(req.url!, { method: req.method, headers: req.headers }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      })
      req.pipe(upstream)
    })
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r))
    const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    try {
      const item = newItem('/file', 'proxied.bin')
      const c = ctx(4)
      c.request = { ...c.request, proxyFor: async () => proxyUrl }
      await new HttpDownload(item, c).start()
      expect((await readFile(join(dir, 'proxied.bin'))).equals(PAYLOAD)).toBe(true)
      expect(proxied).toBeGreaterThanOrEqual(2)
    } finally {
      proxy.close()
    }
  })

  it('respects the speed limiter', async () => {
    const item = newItem('/file', 'limited.bin')
    const c = ctx(4)
    c.limiter = new SpeedLimiter(3 * 1024 * 1024)
    const started = Date.now()
    await new HttpDownload(item, c).start()
    // ~6 MB at 3 MB/s (with a 1 s burst) must take well over a second
    expect(Date.now() - started).toBeGreaterThan(900)
    expect((await readFile(join(dir, 'limited.bin'))).equals(PAYLOAD)).toBe(true)
  })
})
