import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { createDefaultSettings, mergeSettings } from '@shared/defaults'
import { SUPPORTED_LANGUAGES } from '@shared/i18n'

export class SettingsStore extends EventEmitter {
  private file = join(app.getPath('userData'), 'settings.json')
  private value: Settings

  constructor() {
    super()
    const sys = app.getLocale().split('-')[0]
    const lang = SUPPORTED_LANGUAGES.some((l) => l.code === sys) ? sys : 'en'
    const defaults = createDefaultSettings(join(app.getPath('downloads'), 'Downly'), lang)
    let saved: Partial<Settings> | undefined
    try {
      saved = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      saved = undefined
    }
    this.value = mergeSettings(defaults, saved)
  }

  get(): Settings {
    return this.value
  }

  update(patch: Partial<Settings>): Settings {
    this.value = mergeSettings(this.value, patch)
    this.emit('changed', this.value)
    void this.persist()
    return this.value
  }

  private async persist(): Promise<void> {
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify(this.value, null, 2))
    await rename(tmp, this.file)
  }
}
