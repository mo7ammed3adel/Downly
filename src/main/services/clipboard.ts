import { clipboard } from 'electron'
import { EventEmitter } from 'node:events'
import type { Settings } from '@shared/types'
import { extensionOf, isHttpUrl, isKnownMediaSite, parseSpotifyUrl } from '@shared/util'

/** Emits 'url' when a downloadable link (or a media/Spotify page) is copied. */
export class ClipboardMonitor extends EventEmitter {
  private timer?: NodeJS.Timeout
  private last = ''

  constructor(private getSettings: () => Settings) {
    super()
  }

  apply(): void {
    const on = this.getSettings().clipboardMonitor
    if (on && !this.timer) {
      this.last = clipboard.readText().trim()
      this.timer = setInterval(() => this.poll(), 1000)
    } else if (!on && this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  private poll(): void {
    const text = clipboard.readText().trim()
    if (text === this.last) return
    this.last = text
    if (!isHttpUrl(text)) return
    const exts = this.getSettings().browserIntegration.interceptExtensions
    let path = ''
    try {
      path = new URL(text).pathname
    } catch {
      return
    }
    if (exts.includes(extensionOf(path)) || isKnownMediaSite(text) || parseSpotifyUrl(text)) this.emit('url', text)
  }
}
