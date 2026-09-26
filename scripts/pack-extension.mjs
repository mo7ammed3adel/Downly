// Builds store-ready zips of ./extension:
//   release/downly-chrome.zip   → Chrome Web Store, Edge Add-ons, Opera (service worker only)
//   release/downly-firefox.zip  → Firefox AMO (background scripts + gecko id)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const src = resolve(root, 'extension')
const release = resolve(root, 'release')
mkdirSync(release, { recursive: true })
const base = JSON.parse(readFileSync(resolve(src, 'manifest.json'), 'utf8'))

const targets = {
  chrome: (m) => {
    m.background = { service_worker: 'background.js' }
    delete m.browser_specific_settings
    return m
  },
  firefox: (m) => {
    m.background = { scripts: ['i18n.js', 'background.js'] }
    return m
  }
}

function zip(dir, out) {
  rmSync(out, { force: true })
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dir}\\*' -DestinationPath '${out}'`], { stdio: 'inherit' })
  } else {
    execFileSync('zip', ['-qr', out, '.'], { cwd: dir, stdio: 'inherit' })
  }
}

for (const [name, transform] of Object.entries(targets)) {
  const dir = resolve(tmpdir(), `downly-ext-${name}`)
  rmSync(dir, { recursive: true, force: true })
  cpSync(src, dir, { recursive: true })
  const manifest = transform(structuredClone(base))
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const out = resolve(release, `downly-${name}.zip`)
  zip(dir, out)
  rmSync(dir, { recursive: true, force: true })
  console.log(`${name}: ${out}`)
}
