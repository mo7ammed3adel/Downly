// Builds store-ready zips of ./extension:
//   release/downly-chrome.zip   → Chrome Web Store, Edge Add-ons, Opera (service worker only)
//   release/downly-firefox.zip  → Firefox AMO (background scripts + gecko id)
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    // Chrome-only: hides the browser's download bubble
    m.permissions = m.permissions.filter((p) => p !== 'downloads.ui')
    return m
  }
}

function zip(dir, out) {
  rmSync(out, { force: true })
  if (process.platform === 'win32') {
    // Windows 10+ ships bsdtar, which writes a zip for a .zip name (PowerShell's module can be
    // missing). By full path: a Git for Windows tar earlier on PATH reads "C:" as a remote host.
    // bsdtar can't open non-ASCII paths, so it writes next to the staging folder, then we copy.
    const tar = resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    const staged = `${dir}.zip`
    rmSync(staged, { force: true })
    // Name the entries (not ".") so the store sees manifest.json at the root, not ./manifest.json
    execFileSync(tar, ['-a', '-c', '-f', staged, '-C', dir, ...readdirSync(dir)], { stdio: 'inherit' })
    copyFileSync(staged, out)
    rmSync(staged, { force: true })
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
