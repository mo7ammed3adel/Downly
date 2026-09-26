// Builds the installers for one platform into release/:
//   node scripts/dist.mjs win     → Downly-Setup.exe (Windows 10/11, x64)
//   node scripts/dist.mjs win7    → Downly-Setup-Win7-x64.exe + Downly-Setup-Win7-x86.exe (Electron 22)
//   node scripts/dist.mjs store   → Downly-Store.appx for the Microsoft Store (the Store signs it)
//   node scripts/dist.mjs mac     → Downly-mac-arm64.dmg + Downly-mac-x64.dmg
//   node scripts/dist.mjs linux   → Downly-linux.AppImage + Downly-linux.deb
// ffmpeg-static only ships the binary for one CPU, so it is swapped per architecture.
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const ELECTRON_LEGACY = '22.3.27'
// ffmpeg-static's latest release has no 32-bit Windows binary; b6.0 is the newest that does
const FFMPEG_RELEASE_IA32 = 'b6.0'
const root = resolve(import.meta.dirname, '..')
const target = process.argv[2]

const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })

function installFfmpeg(platform, arch) {
  const binary = resolve(root, 'node_modules/ffmpeg-static', platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  rmSync(binary, { force: true })
  const release = arch === 'ia32' ? { FFMPEG_BINARY_RELEASE: FFMPEG_RELEASE_IA32 } : {}
  run('node node_modules/ffmpeg-static/install.js', { npm_config_arch: arch, npm_config_platform: platform, ...release })
}

const builder = (args) => run(`npx electron-builder ${args} --publish never`)

const JOBS = {
  win: () => {
    installFfmpeg('win32', 'x64')
    builder('--win nsis --x64')
  },
  store: () => {
    // The package identity comes from Partner Center (Product identity page)
    const { STORE_IDENTITY_NAME, STORE_PUBLISHER, STORE_PUBLISHER_NAME } = process.env
    if (!STORE_IDENTITY_NAME || !STORE_PUBLISHER || !STORE_PUBLISHER_NAME) {
      throw new Error('Set STORE_IDENTITY_NAME, STORE_PUBLISHER and STORE_PUBLISHER_NAME from Partner Center')
    }
    installFfmpeg('win32', 'x64')
    builder(
      `--win appx --x64 -c.appx.identityName="${STORE_IDENTITY_NAME}" -c.appx.publisher="${STORE_PUBLISHER}" ` +
        `-c.appx.publisherDisplayName="${STORE_PUBLISHER_NAME}"`
    )
  },
  win7: () => {
    for (const [arch, label] of [
      ['x64', 'x64'],
      ['ia32', 'x86']
    ]) {
      installFfmpeg('win32', arch)
      builder(`--win nsis --${arch} -c.electronVersion=${ELECTRON_LEGACY} -c.win.artifactName=Downly-Setup-Win7-${label}.\${ext}`)
    }
  },
  mac: () => {
    for (const arch of ['arm64', 'x64']) {
      installFfmpeg('darwin', arch)
      builder(`--mac dmg --${arch}`)
    }
  },
  linux: () => {
    installFfmpeg('linux', 'x64')
    builder('--linux AppImage deb --x64')
  }
}

if (!JOBS[target]) {
  console.error(`Usage: node scripts/dist.mjs <${Object.keys(JOBS).join('|')}>`)
  process.exit(1)
}

run('npx electron-vite build')
try {
  JOBS[target]()
} finally {
  // Restore the ffmpeg for this machine so `npm run dev` keeps working
  installFfmpeg(process.platform, process.arch)
}
