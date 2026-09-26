// Builds the Windows 7 / 8 / 8.1 installers on Electron 22 (the last Electron that runs
// there) for 64-bit and 32-bit PCs:
//   release/win7/Downly-Setup-Win7-x64.exe
//   release/win7/Downly-Setup-Win7-x86.exe
// Windows 10/11 users should get the regular build (npm run dist:win).
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const ELECTRON_LEGACY = '22.3.27'
const root = resolve(import.meta.dirname, '..')
const ffmpegBinary = resolve(root, 'node_modules/ffmpeg-static/ffmpeg.exe')

const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })

/** ffmpeg-static ships one binary for one CPU; swap in the one this installer needs */
function installFfmpeg(arch) {
  rmSync(ffmpegBinary, { force: true })
  run('node node_modules/ffmpeg-static/install.js', { npm_config_arch: arch, npm_config_platform: 'win32' })
}

run('npx electron-vite build')
try {
  for (const [arch, label] of [
    ['x64', 'x64'],
    ['ia32', 'x86']
  ]) {
    installFfmpeg(arch)
    run(
      [
        'npx electron-builder --win nsis',
        `--${arch}`,
        `-c.electronVersion=${ELECTRON_LEGACY}`,
        '-c.directories.output=release/win7',
        `-c.win.artifactName=Downly-Setup-Win7-${label}.\${ext}`,
        '--publish never'
      ].join(' ')
    )
  }
} finally {
  // Put back the binary for this machine so `npm run dev` keeps working
  installFfmpeg(process.arch)
}
