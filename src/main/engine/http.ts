import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import { extensionOf, sanitizeFileName } from '@shared/util'

/**
 * Minimal HTTP client on top of node:http/https: redirects, timeouts, abort signals and
 * HTTP(S) proxies via CONNECT. Only built-in modules, so it runs on the Node 16 inside
 * Electron 22 (Windows 7/8 build) as well as on current Electron.
 */

/** Returns the proxy URL for a target (`http://host:port`), or null for a direct connection */
export type ProxyResolver = (url: string) => Promise<string | null>

export const directConnection: ProxyResolver = async () => null

const agents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 64 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 64 })
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
  /** 4xx (except 408/429) won't get better by retrying — usually an expired link */
  get fatal(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429
  }
}

export interface RequestOptions {
  headers: Record<string, string>
  timeoutMs: number
  proxyFor: ProxyResolver
  signal?: AbortSignal
  method?: string
  body?: string
}

export interface HttpResponse {
  statusCode: number
  headers: IncomingHttpHeaders
  body: IncomingMessage
}

export function buildHeaders(
  userAgent: string,
  extra?: Record<string, string>,
  cookies?: string,
  referrer?: string
): Record<string, string> {
  const h: Record<string, string> = { 'user-agent': userAgent, accept: '*/*', 'accept-encoding': 'identity' }
  if (referrer) h.referer = referrer
  if (cookies) h.cookie = cookies
  for (const [k, v] of Object.entries(extra ?? {})) h[k.toLowerCase()] = v
  return h
}

/** Drop a response body we don't need without leaving an unhandled stream error behind */
export function discard(body: IncomingMessage): void {
  body.on('error', () => {})
  body.resume()
  body.destroy()
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 10

export async function httpRequest(url: string, opts: RequestOptions): Promise<HttpResponse> {
  let target = new URL(url)
  let method = opts.method ?? 'GET'
  let body = opts.body
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await once(target, method, body, opts)
    const location = res.headers.location
    if (REDIRECTS.has(res.statusCode ?? 0) && location) {
      discard(res)
      target = new URL(location, target)
      if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && method === 'POST')) {
        method = 'GET'
        body = undefined
      }
      continue
    }
    return { statusCode: res.statusCode ?? 0, headers: res.headers, body: res }
  }
  throw new Error('Too many redirects')
}

export function httpGet(url: string, opts: RequestOptions, range?: string): Promise<HttpResponse> {
  const headers = { ...opts.headers }
  if (range) headers.range = range
  return httpRequest(url, { ...opts, headers, method: 'GET', body: undefined })
}

async function once(url: URL, method: string, body: string | undefined, opts: RequestOptions): Promise<IncomingMessage> {
  const proxy = await opts.proxyFor(url.href)
  const headers: Record<string, string> = { ...opts.headers }
  if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body))
  const secure = url.protocol === 'https:'

  let request: http.ClientRequest
  if (!proxy) {
    request = (secure ? https : http).request(url, { method, headers, agent: agents[url.protocol as 'http:'], signal: opts.signal })
  } else {
    const p = new URL(proxy)
    const auth = p.username ? `Basic ${Buffer.from(`${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`).toString('base64')}` : undefined
    if (!secure) {
      // Plain HTTP through a proxy: send the absolute URL to the proxy
      if (auth) headers['proxy-authorization'] = auth
      request = http.request({ host: p.hostname, port: p.port || 80, path: url.href, method, headers, signal: opts.signal })
    } else {
      const socket = await tunnel(p, url, auth, opts)
      request = https.request(url, {
        method,
        headers,
        signal: opts.signal,
        agent: false,
        createConnection: () => tls.connect({ socket, servername: url.hostname })
      })
    }
  }

  return new Promise((resolve, reject) => {
    request.setTimeout(opts.timeoutMs, () => request.destroy(new Error(`Connection timed out after ${Math.round(opts.timeoutMs / 1000)}s`)))
    request.on('response', (res) => {
      // After headers arrive the same idle timeout guards the body
      res.setTimeout?.(opts.timeoutMs, () => res.destroy(new Error('Connection stalled')))
      resolve(res)
    })
    request.on('error', reject)
    request.end(body)
  })
}

/** Opens a CONNECT tunnel through an HTTP proxy for an https:// target */
function tunnel(proxy: URL, target: URL, auth: string | undefined, opts: RequestOptions): Promise<import('node:net').Socket> {
  return new Promise((resolve, reject) => {
    const port = target.port || '443'
    const req = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${port}`,
      headers: { host: `${target.hostname}:${port}`, ...(auth ? { 'proxy-authorization': auth } : {}) },
      signal: opts.signal
    })
    req.setTimeout(opts.timeoutMs, () => req.destroy(new Error('Proxy timed out')))
    req.on('connect', (res, socket) => {
      if (res.statusCode === 200) resolve(socket)
      else {
        socket.destroy()
        reject(new Error(`Proxy refused the connection (HTTP ${res.statusCode})`))
      }
    })
    req.on('error', reject)
    req.end()
  })
}

async function readAll(body: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

export interface SimpleResponse {
  ok: boolean
  status: number
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}

export type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<SimpleResponse>

/** A small fetch() replacement (Node 16 has no global fetch) that honours the proxy settings */
export function createFetcher(proxyFor: ProxyResolver = directConnection, timeoutMs = 30_000): Fetcher {
  return async (url, init = {}) => {
    const res = await httpRequest(url, {
      method: init.method,
      body: init.body,
      headers: { 'user-agent': 'Mozilla/5.0 Downly', 'accept-encoding': 'identity', ...init.headers },
      timeoutMs,
      proxyFor
    })
    let cached: Promise<string> | undefined
    const text = () => (cached ??= readAll(res.body))
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text,
      json: async <T>() => JSON.parse(await text()) as T
    }
  }
}

export interface ProbeInfo {
  fileName: string
  size: number
  resumable: boolean
  mime?: string
}

export async function probe(url: string, opts: RequestOptions): Promise<ProbeInfo> {
  const res = await httpGet(url, opts, 'bytes=0-0')
  discard(res.body)
  if (res.statusCode >= 400) throw new HttpError(res.statusCode, `HTTP ${res.statusCode}`)

  const header = (name: string) => {
    const v = res.headers[name]
    return Array.isArray(v) ? v[0] : v
  }
  const mime = header('content-type')?.split(';')[0].trim()
  let size = -1
  let resumable = false
  if (res.statusCode === 206) {
    const total = /\/(\d+)\s*$/.exec(header('content-range') ?? '')
    if (total) {
      size = Number(total[1])
      resumable = true
    }
  } else {
    const len = Number(header('content-length'))
    if (Number.isFinite(len) && len > 0) size = len
  }
  return { fileName: fileNameFrom(url, header('content-disposition'), mime), size, resumable, mime }
}

const MIME_EXT: Record<string, string> = {
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'application/pdf': 'pdf',
  'application/x-msdownload': 'exe',
  'application/x-msi': 'msi',
  'application/vnd.android.package-archive': 'apk',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/html': 'html',
  'application/json': 'json'
}

export function fileNameFrom(url: string, disposition?: string, mime?: string): string {
  let name = ''
  if (disposition) {
    const star = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/i.exec(disposition)
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)
    try {
      name = star ? decodeURIComponent(star[1].trim()) : plain ? plain[1].trim() : ''
    } catch {
      name = plain?.[1] ?? ''
    }
  }
  if (!name) {
    try {
      const path = new URL(url).pathname
      name = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
    } catch {
      /* keep empty */
    }
  }
  name = sanitizeFileName(name || 'download')
  if (!extensionOf(name) && mime && MIME_EXT[mime]) name += `.${MIME_EXT[mime]}`
  return name
}
