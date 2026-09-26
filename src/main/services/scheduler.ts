import { exec } from 'node:child_process'
import type { SchedulerSettings } from '@shared/types'

/**
 * IDM-style scheduler: starts the queue at a set time on chosen weekdays,
 * optionally stops it later, and can shut down / sleep the PC when all is done.
 */
export class Scheduler {
  private timer?: NodeJS.Timeout
  private lastFired = ''

  constructor(
    private get: () => SchedulerSettings,
    private actions: { start(): void; stop(): void }
  ) {}

  run(): void {
    this.timer ??= setInterval(() => this.tick(), 15_000)
  }

  dispose(): void {
    clearInterval(this.timer)
  }

  private tick(): void {
    const s = this.get()
    if (!s.enabled) return
    const now = new Date()
    if (!s.days.includes(now.getDay())) return
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const key = `${now.toDateString()} ${hhmm}`
    if (key === this.lastFired) return
    if (s.startTime === hhmm) {
      this.lastFired = key
      this.actions.start()
    } else if (s.stopTime && s.stopTime === hhmm) {
      this.lastFired = key
      this.actions.stop()
    }
  }

  /** Called when the queue drains; returns true if the app should quit */
  afterDone(): boolean {
    const s = this.get()
    if (!s.enabled) return false
    switch (s.afterDone) {
      case 'shutdown':
        powerAction('shutdown')
        return true
      case 'sleep':
        powerAction('sleep')
        return false
      case 'exit':
        return true
      default:
        return false
    }
  }
}

function powerAction(kind: 'shutdown' | 'sleep'): void {
  const cmd =
    process.platform === 'win32'
      ? kind === 'shutdown'
        ? 'shutdown /s /t 60 /c "Downly: downloads finished"'
        : 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0'
      : process.platform === 'darwin'
        ? kind === 'shutdown'
          ? `osascript -e 'tell app "System Events" to shut down'`
          : 'pmset sleepnow'
        : kind === 'shutdown'
          ? 'systemctl poweroff'
          : 'systemctl suspend'
  exec(cmd)
}
