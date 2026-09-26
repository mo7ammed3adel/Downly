import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultSettings } from '@shared/defaults'
import { DownloadManager } from '../src/main/engine/DownloadManager'

describe('DownloadManager.importFile', () => {
  let dir = ''
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('moves the file into its category folder and lists it as completed', async () => {
    dir = await mkdtemp(join(tmpdir(), 'downly-import-'))
    const settings = createDefaultSettings(join(dir, 'Downloads'), 'en')
    const manager = new DownloadManager({
      dataFile: join(dir, 'downloads.json'),
      getSettings: () => settings,
      proxyFor: async () => undefined,
      ytdlpEnv: async () => {
        throw new Error('not used')
      }
    })
    const completed = new Promise((resolve) => manager.once('completed', resolve))
    const temp = join(dir, 'upload.part')
    await writeFile(temp, 'video bytes')

    const item = await manager.importFile(temp, 'WhatsApp-1.mp4', 'https://web.whatsapp.com/')

    expect(await completed).toBe(item)
    expect(item.status).toBe('completed')
    expect(item.size).toBe(11)
    expect(item.category).toBe('video')
    expect(await readFile(join(item.directory, item.fileName), 'utf8')).toBe('video bytes')
    await expect(stat(temp)).rejects.toThrow()
    expect(manager.list()).toContain(item)
  })
})
