import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import type { ExternalAddRequest, Settings } from '@shared/types'
import { isHttpUrl } from '@shared/util'
import { BRIDGE_PORT_COUNT } from '@shared/defaults'

const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|extension|safari-web-extension):\/\//

/**
 * Local HTTP endpoint the browser extension talks to (127.0.0.1 only).
 * Web pages cannot use it: every call must come from an extension origin,
 * which pages cannot fake, so a random site can't queue downloads.
 * Events: 'add' (ExternalAddRequest), 'batch' ({ urls, pageUrl })
 */
export class BrowserBridge extends EventEmitter {
  private server?: Server
  /** The configured first port; the server may sit on a later one if that was taken */
  private basePort = 0
  /** Port actually listened on (0 until listening) */
  port = 0
  /** When the extension last talked to us (0 = never since start) */
  lastSeen = 0

  constructor(
    private getSettings: () => Settings,
    private version: string
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
        intercept: { extensions: b.interceptExtensions, minSizeKB: b.minSizeKB, skipDomains: b.skipDomains }
      })
    }
    if (req.method !== 'POST') return this.reply(res, 404)

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
        media: url.pathname === '/media',
        mode: body.mode === 'audio' || body.mode === 'video' ? body.mode : undefined,
        quick: body.quick === true
      }
      this.emit('add', request)
      return this.reply(res, 200, { ok: true })
    }
    if (url.pathname === '/links') {
      const urls = Array.isArray(body.urls) ? body.urls.map(String).filter(isHttpUrl).slice(0, 5000) : []
      this.emit('batch', { urls, pageUrl: str(body.pageUrl) })
      return this.reply(res, 200, { ok: true, count: urls.length })
    }
    return this.reply(res, 404)
  }

  private reply(res: ServerResponse, status: number, json?: unknown): void {
    res.statusCode = status
    if (json !== undefined) res.setHeader('content-type', 'application/json')
    res.end(json !== undefined ? JSON.stringify(json) : undefined)
  }
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
