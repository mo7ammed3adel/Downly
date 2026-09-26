import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { format } from 'node:util'

/**
 * A small log file for problem reports: everything written to the console plus uncaught
 * errors, kept under ~1 MB (the previous file is kept once as downly.old.log).
 */
const MAX_BYTES = 1024 * 1024
let file = ''

export function startLog(): void {
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  file = join(dir, 'downly.log')
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      write(level, format(...args))
    }
  }
  process.on('uncaughtException', (err) => write('error', `uncaught: ${err.stack ?? err}`))
  process.on('unhandledRejection', (err) => write('error', `unhandled: ${err instanceof Error ? err.stack : err}`))
  write('log', `Downly ${app.getVersion()} started (${process.platform} ${process.arch}, Electron ${process.versions.electron})`)
}

function write(level: string, text: string): void {
  if (!file) return
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) renameSync(file, file.replace(/\.log$/, '.old.log'))
    appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase()} ${text}\n`)
  } catch {
    /* logging must never break the app */
  }
}

/** The last lines of the log, for a problem report */
export async function recentLog(lines = 400): Promise<string> {
  const text = await readFile(file, 'utf8').catch(() => '')
  return text.split('\n').slice(-lines).join('\n')
}
