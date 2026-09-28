import { describe, expect, it } from 'vitest'
import { explainError } from '@shared/errors'

describe('explainError', () => {
  it('recognises the common yt-dlp messages', () => {
    expect(explainError('[generic] stream: This video is DRM protected')).toBe('errors.drm')
    expect(explainError("[youtube] x: Sign in to confirm you're not a bot")).toBe('errors.login')
    expect(explainError('[youtube] x: Private video')).toBe('errors.private')
    expect(explainError('Unsupported URL: https://example.com')).toBe('errors.unsupported')
    expect(explainError('HTTP Error 403: Forbidden')).toBe('errors.forbidden')
    expect(explainError('HTTP 405')).toBe('errors.needsForm')
    expect(explainError('HTTP Error 429: Too Many Requests')).toBe('errors.rateLimited')
  })
  it('leaves unknown errors alone', () => {
    expect(explainError('Something odd happened')).toBeNull()
  })
})
