import { describe, expect, it } from 'vitest'
import type { DownloadItem } from '@shared/types'
import { createDefaultSettings } from '@shared/defaults'
import { buildReport } from '../src/main/services/report'

const item = (id: string, status: DownloadItem['status'], createdAt: number, error?: string): DownloadItem => ({
  id,
  kind: 'http',
  url: `https://example.com/${id}.zip`,
  fileName: `${id}.zip`,
  directory: 'C:\Users\Someone\Downloads\Private',
  category: 'compressed',
  size: 1,
  downloaded: 0,
  status,
  error,
  resumable: false,
  segments: [],
  createdAt,
  speed: 0,
  eta: -1
})

describe('buildReport', () => {
  it('has the note, versions, failed downloads and log, but no folders or keys', () => {
    const settings = createDefaultSettings('C:\Users\Someone\Downloads\Downly', 'ar')
    settings.spotify = { clientId: 'id-123', clientSecret: 'secret-456' }
    const text = buildReport({
      note: 'The video does not download',
      version: '1.0.6',
      ytdlpVersion: '2026.08.19',
      windowsStore: false,
      settings,
      downloads: [item('ok', 'completed', 1), item('bad', 'error', 2, 'HTTP 403')],
      log: 'LOG LINE'
    })
    expect(text).toContain('The video does not download')
    expect(text).toContain('Downly 1.0.6')
    expect(text).toContain('https://example.com/bad.zip')
    expect(text).toContain('HTTP 403')
    expect(text).not.toContain('https://example.com/ok.zip')
    expect(text).toContain('LOG LINE')
    expect(text).not.toContain('Someone')
    expect(text).not.toContain('secret-456')
  })
})
