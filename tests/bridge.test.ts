import { createServer, type Server } from 'node:http'
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
