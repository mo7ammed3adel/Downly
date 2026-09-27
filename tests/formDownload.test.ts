import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DownloadItem } from '@shared/types'
import { createDefaultSettings } from '@shared/defaults'
import { DownloadManager } from '../src/main/engine/DownloadManager'

describe('form (POST) downloads', () => {
  let server: Server | undefined
  let dir = ''
  afterEach(async () => {
    server?.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('submits the same form and saves what comes back', async () => {
    const received: string[] = []
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received.push(`${req.method} ${req.headers['content-type']} ${body}`)
        if (req.method !== 'POST' || !body.includes('files=a%2Cb')) return res.writeHead(403).end()
        res.setHeader('content-type', 'application/zip')
        res.end(Buffer.alloc(5000, 1)) // built on the fly: no length, no ranges
      })
    })
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/zip`

    dir = await mkdtemp(join(tmpdir(), 'downly-form-'))
    const settings = createDefaultSettings(dir, 'en')
    const manager = new DownloadManager({
      dataFile: join(dir, 'downloads.json'),
      getSettings: () => settings,
      proxyFor: async () => undefined,
      ytdlpEnv: async () => {
        throw new Error('not used')
      }
    })
    const done = new Promise<DownloadItem>((resolve, reject) => {
      manager.once('completed', resolve)
      manager.once('failed', (i: DownloadItem) => reject(new Error(i.error)))
    })
    await manager.add([
      { url, kind: 'http', fileName: 'selected.zip', post: { body: 'files=a%2Cb&token=t', contentType: 'application/x-www-form-urlencoded' } }
    ])
    const item = await done

    expect(received.every((r) => r.startsWith('POST application/x-www-form-urlencoded files=a%2Cb'))).toBe(true)
    expect((await readFile(join(item.directory, item.fileName))).length).toBe(5000)
  })
})
