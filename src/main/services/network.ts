import { session } from 'electron'
import type { Settings } from '@shared/types'
import type { ProxyResolver } from '../engine/http'

/**
 * Resolves the proxy for a URL: none, a manual one, or whatever the OS/PAC says
 * (via Chromium's resolver, so corporate PAC files work too).
 */
export async function proxyFor(url: string, settings: Settings, allowSocks: boolean): Promise<string | null> {
  const { mode, url: manual } = settings.proxy
  if (mode === 'none') return null
  if (mode === 'manual') {
    if (!manual) return null
    const full = /^[a-z0-9]+:\/\//i.test(manual) ? manual : `http://${manual}`
    // Callers that can't speak SOCKS (the built-in HTTP client) connect directly instead
    return allowSocks || !/^socks/i.test(full) ? full : null
  }
  const rule = (await session.defaultSession.resolveProxy(url)).split(';')[0].trim()
  const [type, hostPort] = rule.split(/\s+/)
  switch (type?.toUpperCase()) {
    case 'PROXY':
      return `http://${hostPort}`
    case 'HTTPS':
      return `https://${hostPort}`
    case 'SOCKS':
    case 'SOCKS5':
      return allowSocks ? `socks5://${hostPort}` : null
    case 'SOCKS4':
      return allowSocks ? `socks4://${hostPort}` : null
    default:
      return null
  }
}

export function createProxyResolver(getSettings: () => Settings): ProxyResolver {
  // The built-in client tunnels through HTTP proxies; SOCKS falls back to direct
  return (url) => proxyFor(url, getSettings(), false)
}
