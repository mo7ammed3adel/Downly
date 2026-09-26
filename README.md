# Downly

A desktop download manager in the spirit of IDM / FDM, plus a browser extension.

- Multi-connection downloads (up to 32 per file), with dynamic segmentation: a connection that finishes takes over half of the biggest remaining range.
- Pause/resume that survives app restarts, auto-retry, and "refresh download address" for expired links.
- YouTube and 1000+ sites via yt-dlp: pick the quality (144p–8K), the format (MP4/MKV/WebM), or audio only (MP3/M4A/Opus/FLAC/WAV). Subtitles, cover art and tags can be embedded.
- Whole playlists at once, with per-item selection.
- Spotify tracks, albums, playlists and artists. The metadata comes from Spotify, the audio is matched on YouTube, and the file is tagged with the Spotify title, artist, album and cover. Spotify's DRM is not bypassed.
- Browser takeover for Chrome, Edge, Brave, Opera, Vivaldi and Firefox, a "Download" button on videos, detection of media on a page, "download all links", and context menus.
- Batch downloads and URL patterns (`file[001-120].zip`), clipboard monitoring, and drag & drop.
- Speed limiter, scheduler (start/stop times, weekdays, shutdown/sleep when finished), proxy (system/PAC/manual), category folders, tray icon, notifications, and start with the system.
- Completely free, with no limits or ads; supported by donations.
- 13 languages (full English and Arabic; the rest cover the core UI and fall back to English), RTL, and light/dark/system themes.

## Development

```bash
npm install
npm run dev          # app with hot reload
npm test             # unit + engine tests (local HTTP server)
SG_YTDLP=<path to yt-dlp> npx vitest run tests/media.integration.test.ts   # real YouTube/Spotify
npm run typecheck
npm run dist:win     # installer in ./release (dist:mac / dist:linux on those OSes)
npm run extension:zip
```

On first launch the app downloads yt-dlp to `%APPDATA%/Downly/bin` and updates it every 3 days. ffmpeg ships inside the app (`ffmpeg-static`). The Electron binary acts as the Node JS runtime that yt-dlp needs for YouTube.

## Installing the extension

- **Chrome / Edge / Brave / Opera:** open `chrome://extensions`, enable Developer mode, click *Load unpacked* and choose the `extension` folder.
- **Firefox:** open `about:debugging` → *This Firefox* → *Load Temporary Add-on* and pick `extension/manifest.json`. For a permanent install, sign it on AMO.
- For the public release, upload `release/downly-extension.zip` to the Chrome Web Store, Edge Add-ons and Firefox AMO.

The extension talks to the app on `127.0.0.1:58732`. The app accepts only requests coming from extension origins, so websites cannot queue downloads.

## Donations

Downly is free with no limits. The donation links (Buy Me a Coffee, InstaPay, Vodafone Cash) live in `src/shared/support.ts` for the app and in the `SITE` object at the top of `website/app.js` for the site; empty values are hidden. The app shows the Support dialog once, after 20 finished downloads (`SUPPORT_PROMPT_AFTER`), and always from the ❤ button.

## Website (Vercel)

`website/` is a static site (no build step) with Arabic/English and light/dark modes. It detects the visitor's OS and links to the installers on GitHub Releases (`SITE.repo`).

```bash
npx vercel login
npx vercel --prod --cwd website
```

Or import the repo on vercel.com and set the **Root Directory** to `website`. `?lang=ar` opens the Arabic version.

## Releasing the app

`npm run dist:win` produces `release/Downly-Setup.exe`. Upload it to a GitHub Release (set `publish.owner`/`repo` in `package.json`, then `npx electron-builder --win --publish always` with a `GH_TOKEN`). The website's download button always points to `releases/latest/download/Downly-Setup.exe`.

## Structure

```
src/main/engine     HttpDownload (segmented), DownloadManager (queue), ytdlp, spotify, SpeedLimiter
src/main/services   bridge (extension), scheduler, clipboard, binaries, network/proxy, settings
src/renderer        React UI (store, components, styles)
src/shared          types, support (donation links), defaults, i18n + locales
website             landing site for Vercel
extension           MV3 browser extension
```

To add a language, add `src/shared/locales/<code>.json` and register it in `src/shared/i18n.ts`.

## Before publishing

- Rename the app (Downly is a placeholder) and set `appId`.
- Sign the code: a Windows certificate avoids SmartScreen warnings, and macOS needs notarization.
- Legal: downloading from YouTube/Spotify can break those sites' terms of service. Add terms of use that make users responsible for the content they download, and be aware that browser extension stores often reject extensions that download from YouTube (Chrome Web Store in particular).
