import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { ExternalAddRequest, FormPost, Settings, TrackMeta } from '@shared/types'
import { isHttpUrl } from '@shared/util'
import { BRIDGE_PORT_COUNT } from '@shared/defaults'

const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|extension|safari-web-extension):\/\//

/**
 * Local HTTP endpoint the browser extension talks to (127.0.0.1 only).
 * Web pages cannot use it: every call must come from an extension origin,
 * which pages cannot fake, so a random site can't queue downloads.
 * Events: 'add' (ExternalAddRequest), 'batch' ({ urls, pageUrl }),
 * 'file' ({ path, fileName, pageUrl }) for media the extension read out of a page (/upload)
 */
export class BrowserBridge extends EventEmitter {
  private server?: Server
  /** The configured first port; the server may sit on a later one if that was taken */
  private basePort = 0
  /** Port actually listened on (0 until listening) */
  port = 0
  /** When the extension last talked to us (0 = never since start) */
  lastSeen = 0
  /** Files being uploaded in chunks: id → bytes received so far */
  private uploads = new Map<string, number>()

  constructor(
    private getSettings: () => Settings,
    private version: string,
    /**
     * Whether the app itself can fetch a download the browser started (single-use links,
     * sessions it can't repeat…). When it can't, the extension lets the browser keep it.
     */
    private canFetch: (req: ExternalAddRequest) => Promise<boolean> = async () => true
  ) {
    super()
  }

  apply(): void {
    const { enabled, port } = this.getSettings().browserIntegration
    if (!enabled) return this.stop()
    if (this.server && this.basePort === port) return
    this.stop()
    this.basePort = port
    this.listen(port, BRIDGE_PORT_COUNT)
  }

  private listen(port: number, triesLeft: number): void {
    const server = createServer((req, res) => void this.handle(req, res))
    this.server = server
    server.once('error', (err) => {
      if (this.server !== server) return // stopped or replaced meanwhile
      this.server = undefined
      // Another program has this port: take the next one, the extension finds it by scanning
      if (triesLeft > 1) this.listen(port + 1, triesLeft - 1)
      else console.log(`[bridge] no free port from ${this.basePort}: ${err.message}`)
    })
    server.listen(port, '127.0.0.1', () => {
      this.port = port
      console.log(`[bridge] listening on ${port}`)
    })
  }

  stop(): void {
    this.server?.close()
    this.server = undefined
    this.port = 0
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin ?? ''
    const extOrigin = EXTENSION_ORIGIN.test(origin)
    if (extOrigin) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-allow-headers', 'content-type, x-downly')
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    }
    if (req.method === 'OPTIONS') return this.reply(res, extOrigin ? 204 : 403)
    // Chrome omits Origin on privileged extension requests, so the extension also sends a
    // custom header. Pages can't add it without a preflight, which is refused above.
    const trusted = extOrigin || (!origin && req.headers['x-downly'] === '1')
    console.log(`[bridge] ${req.method} ${req.url} origin=${origin || '-'} ${trusted ? 'ok' : 'REJECTED'}`)
    if (!trusted) return this.reply(res, 403, { error: 'forbidden' })
    this.lastSeen = Date.now()

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/ping') {
      const b = this.getSettings().browserIntegration
      return this.reply(res, 200, {
        app: 'Downly',
        version: this.version,
        intercept: { all: b.takeAll, extensions: b.interceptExtensions, minSizeKB: b.minSizeKB, skipDomains: b.skipDomains }
      })
    }
    if (req.method !== 'POST') return this.reply(res, 404)
    if (url.pathname === '/upload') return this.receiveChunk(req, res, url)

    let body: Record<string, unknown>
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return this.reply(res, 400, { error: 'bad json' })
    }

    if (url.pathname === '/download' || url.pathname === '/media') {
      const target = String(body.url ?? '')
      if (!isHttpUrl(target)) return this.reply(res, 400, { error: 'bad url' })
      const request: ExternalAddRequest = {
        url: target,
        fileName: str(body.fileName),
        size: typeof body.size === 'number' ? body.size : undefined,
        referrer: str(body.referrer),
        pageUrl: str(body.pageUrl),
        cookies: str(body.cookies),
        userAgent: str(body.userAgent),
        headers: forwardHeaders(body.headers),
        tracks: tracksFrom(body.tracks),
        collection: str(body.collection),
        form: formFrom(body.form),
        media: url.pathname === '/media',
        mode: body.mode === 'audio' || body.mode === 'video' ? body.mode : undefined,
        quick: body.quick === true
      }
      // The extension holds the browser's copy until we say we can fetch the file ourselves
      if (body.verify === true && !(await this.canFetch(request).catch(() => false))) {
        return this.reply(res, 200, { ok: false, reason: 'unreachable' })
      }
      this.emit('add', request)
      return this.reply(res, 200, { ok: true })
    }
    if (url.pathname === '/links') {
      const urls = Array.isArray(body.urls) ? body.urls.map(String).filter(isHttpUrl).slice(0, 5000) : []
      this.emit('batch', { urls, pageUrl: str(body.pageUrl) })
      return this.reply(res, 200, { ok: true, count: urls.length })
    }
    if (url.pathname === '/upload/done') {
      const id = String(body.id ?? '')
      if (!this.uploads.has(id)) return this.reply(res, 404, { error: 'unknown upload' })
      this.uploads.delete(id)
      this.emit('file', { path: uploadPath(id), fileName: str(body.fileName) ?? 'file', pageUrl: str(body.pageUrl) })
      return this.reply(res, 200, { ok: true })
    }
    return this.reply(res, 404)
  }

  /**
   * One piece of a file the extension read out of a page (WhatsApp media only exists
   * decrypted inside the page). Pieces arrive in order: ?id=…&offset=<bytes so far>.
   */
  private async receiveChunk(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const id = url.searchParams.get('id') ?? ''
    const offset = Number(url.searchParams.get('offset'))
    if (!UPLOAD_ID.test(id)) return this.reply(res, 400, { error: 'bad id' })
    const received = this.uploads.get(id) ?? 0
    if (offset !== received) return this.reply(res, 409, { error: 'out of order', received })
    try {
      if (offset === 0) await mkdir(join(tmpdir(), 'downly-uploads'), { recursive: true })
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_CHUNK) req.destroy(new Error('chunk too large'))
      })
      await pipeline(req, createWriteStream(uploadPath(id), { flags: offset === 0 ? 'w' : 'a' }))
      this.uploads.set(id, received + size)
      this.reply(res, 200, { ok: true, received: received + size })
    } catch {
      this.uploads.delete(id)
      await rm(uploadPath(id), { force: true })
      this.reply(res, 500, { error: 'write failed' })
    }
  }

  private reply(res: ServerResponse, status: number, json?: unknown): void {
    res.statusCode = status
    if (json !== undefined) res.setHeader('content-type', 'application/json')
    res.end(json !== undefined ? JSON.stringify(json) : undefined)
  }
}

const UPLOAD_ID = /^[\w-]{8,64}$/
const MAX_CHUNK = 16 * 1024 * 1024
const uploadPath = (id: string) => join(tmpdir(), 'downly-uploads', `${id}.part`)

/**
 * Page headers worth repeating to the site (tokens and origin checks). Everything else is
 * either set by the app itself (Referer, Cookie, User-Agent have their own fields) or would
 * break the request (Range, Host, encodings).
 */
const FORWARDED = /^(origin|authorization|x-[\w-]+)$/i
function forwardHeaders(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const safe = (value: unknown): value is string => typeof value === 'string' && value.length <= 4096 && !/[\r\n]/.test(value)
  const picked = Object.entries(v as Record<string, unknown>)
    .filter(([name, value]) => FORWARDED.test(name) && safe(value))
    .slice(0, 20) as [string, string][]
  return picked.length ? Object.fromEntries(picked) : undefined
}

/** Songs the extension read off a music page: title and artist required, a few hundred at most */
function tracksFrom(v: unknown): TrackMeta[] | undefined {
  if (!Array.isArray(v)) return undefined
  const text = (x: unknown, max = 300) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined)
  const tracks = v.slice(0, 500).flatMap((t: Record<string, unknown>): TrackMeta[] => {
    const title = text(t?.title)
    const artist = text(t?.artist)
    if (!title || !artist) return []
    const cover = text(t.cover, 2000)
    return [
      {
        title,
        artist,
        album: text(t.album),
        cover: cover && isHttpUrl(cover) ? cover : undefined,
        durationMs: typeof t.durationMs === 'number' && t.durationMs > 0 ? t.durationMs : undefined
      }
    ]
  })
  return tracks.length ? tracks : undefined
}

/** The form a page submitted for a download: text body (≤ 1 MB) and its content type */
function formFrom(v: unknown): FormPost | undefined {
  if (!v || typeof v !== 'object') return undefined
  const { body, contentType } = v as Record<string, unknown>
  if (typeof body !== 'string' || body.length > 1024 * 1024) return undefined
  if (typeof contentType !== 'string' || !/^[\w.+-]+\/[\w.+-]+(;[^\r\n]*)?$/.test(contentType)) return undefined
  return { body, contentType }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

function readBody(req: IncomingMessage, limit = 2 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
