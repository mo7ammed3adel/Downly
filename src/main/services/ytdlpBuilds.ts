import { release } from 'node:os'

const OFFICIAL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
/** Community builds with the same code, compiled with a Python that still runs on Windows 7 */
const WIN7_BUILDS = 'https://github.com/nicolaasjan/yt-dlp/releases/latest/download'

/** Windows 7 is NT 6.1; official yt-dlp builds need Windows 8 (NT 6.2) or newer */
export function isWindows7(osRelease = release()): boolean {
  const [major, minor] = osRelease.split('.').map(Number)
  return major < 6 || (major === 6 && minor < 2)
}

/** Download URL of the right yt-dlp build for this OS version and CPU */
export function ytdlpDownloadUrl(platform: NodeJS.Platform = process.platform, arch = process.arch, osRelease = release()): string | null {
  if (platform === 'darwin') return `${OFFICIAL}/yt-dlp_macos`
  if (platform === 'linux') return `${OFFICIAL}/${arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'}`
  if (platform !== 'win32') return null
  const x86 = arch === 'ia32'
  if (isWindows7(osRelease)) return `${WIN7_BUILDS}/${x86 ? 'yt-dlp_x86_win7.exe' : 'yt-dlp_win7.exe'}`
  return `${OFFICIAL}/${x86 ? 'yt-dlp_x86.exe' : arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe'}`
}
