# Downly for Android

Flutter app: download videos and music from YouTube and 1000+ sites (yt-dlp + ffmpeg via
[youtubedl-android](https://github.com/JunkFood02/youtubedl-android)), with a built-in browser,
a PIN/fingerprint vault, a player, and Share → Downly from any app.

## Build

Flutter/Gradle/CMake can't build from a folder whose path has non-English characters on Windows,
so `tool/build.ps1` mirrors the project to `D:\dev\downly-mobile` and builds there:

```powershell
pwsh mobile/tool/build.ps1              # release APKs → mobile/dist (one per CPU type)
pwsh mobile/tool/build.ps1 -Install     # + installs on the connected phone
```

Release signing: put `storeFile`, `storePassword`, `keyAlias`, `keyPassword` in
`android/key.properties` (git-ignored). Without it, release builds are signed with the debug key.

## Structure

```
android/.../EngineBridge.kt   yt-dlp calls, download events (method/event channels)
android/.../DownloadService   foreground notification while downloads run
android/.../MainActivity      Share intent, FLAG_SECURE for the vault, picture-in-picture
lib/core/                     downloads queue, plain-file downloader, vault, library, settings, strings
lib/ui/                       home, browser, downloads, library, vault, player, settings
```

Files are saved to `Download/Downly/{Videos,Music,Files}`; vault files live in the app's private storage.

Google Play doesn't allow YouTube downloaders, so the APK is distributed from the website.
