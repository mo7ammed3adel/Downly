import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

/**
 * Output targets are pinned to the oldest runtime we ship: Electron 22 (Node 16 /
 * Chromium 108), used by the Windows 7/8 build. The same bundle runs on current Electron.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { target: 'node16' }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { target: 'node16' }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@shared': shared,
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: { target: 'chrome108' }
  }
})
