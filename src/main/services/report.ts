import { release } from 'node:os'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DownloadItem, Settings } from '@shared/types'

export interface ReportInput {
  /** What the user says happened */
  note: string
  version: string
  ytdlpVersion?: string
  windowsStore: boolean
  settings: Settings
  downloads: DownloadItem[]
  log: string
}

/**
 * A plain-text problem report the user sends us: their description, versions, the settings
 * that change behaviour (no folders or credentials), recent failed downloads and the log.
 */
export function buildReport(r: ReportInput, now = new Date()): string {
  const s = r.settings
  const failed = r.downloads
    .filter((d) => d.status === 'error')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
  return [
    'Downly problem report',
    `Created: ${now.toISOString()}`,
    '',
    'What happened:',
    r.note.trim() || '(not written)',
    '',
    `Downly ${r.version}${r.windowsStore ? ' (Microsoft Store)' : ''} · ${process.platform} ${release()} ${process.arch} · Electron ${process.versions.electron} · yt-dlp ${r.ytdlpVersion ?? '—'}`,
    `Language ${s.language} · browser integration ${s.browserIntegration.enabled ? 'on' : 'off'} (port ${s.browserIntegration.port}) · proxy ${s.proxy.mode} · ` +
      `connections ${s.connectionsPerDownload} · cookies from browser ${s.media.cookiesFromBrowser || 'off'} · speed limit ${s.speedLimitEnabled ? `${s.speedLimitKBps} KB/s` : 'off'}`,
    '',
    `Recent failed downloads (${failed.length}):`,
    ...failed.map((d) => `- ${new Date(d.createdAt).toISOString()} [${d.kind}] ${d.url}\n  ${d.error ?? ''}`),
    '',
    'Log (last lines):',
    r.log
  ].join('\n')
}

/** Saves the report on the desktop, where it is easy to find and attach */
export async function saveReport(text: string, desktop: string, now = new Date()): Promise<string> {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const path = join(desktop, `Downly-report-${stamp}.txt`)
  await writeFile(path, text, 'utf8')
  return path
}
