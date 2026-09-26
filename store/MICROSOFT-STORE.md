# Microsoft Store (desktop app)

The Store version is an MSIX package that Microsoft signs, so users get no SmartScreen
warning and updates arrive through the Store. Windows 10 (1809) and later only; Windows 7/8
keep the installer from the website.

## One-time setup

1. Create a free individual developer account at https://storedeveloper.microsoft.com
   (identity verification can take a few days).
2. Partner Center → **Apps and games** → **New product** → **MSIX or PWA app** → reserve the
   name `Downly` (if it's taken, e.g. `Downly Download Manager`).
3. Open the product → **Product management** → **Product identity** and copy three values into
   GitHub → Downly repo → Settings → Secrets and variables → Actions → **Variables** tab:

   | Partner Center field | GitHub variable |
   |---|---|
   | Package/Identity/Name | `STORE_IDENTITY_NAME` |
   | Package/Identity/Publisher (`CN=…`) | `STORE_PUBLISHER` |
   | Package/Properties/PublisherDisplayName | `STORE_PUBLISHER_NAME` |

From then on every release run also builds `Downly-Store.appx`. It is **not** published to the
releases repo: download it from the run page (artifact `microsoft-store-package`) and upload it
in the submission's **Packages** step.

## Submission fields

- **Pricing**: Free. **Markets**: all.
- **Category**: Utilities & tools → File managers (or Productivity).
- **Privacy policy URL**: https://downly-app.vercel.app/privacy
- **Website**: https://downly-app.vercel.app
- **Support contact**: the support page on the website.
- **Age rating**: answer the questionnaire; the app has no user-generated content, chat,
  purchases or location, so it lands at 3+ / Everyone.
- **Screenshots**: at least 1 (1366×768 or larger, PNG). Suggested: main window with downloads
  in progress, the Add dialog with quality choice, the browser button on a video, settings.

### Restricted capability justification (`runFullTrust`)

> Downly is a Win32 desktop app (Electron) packaged as MSIX. It needs full trust to run its
> download engine, write files to the folder the user picks, and run the bundled ffmpeg and
> yt-dlp tools as child processes.

### Notes for certification

> Downly is a free download manager. It downloads files from links the user provides, and
> videos/audio from sites the user visits, using the open-source tools ffmpeg (bundled) and
> yt-dlp. yt-dlp is downloaded from its official GitHub releases on first use and kept up to
> date, because sites change often and a bundled copy stops working within weeks. No account
> is needed and nothing is collected. The optional browser extension talks only to the app on
> 127.0.0.1. To test: paste any direct file link (e.g. a .zip) into the address box and click
> Download.

**Risk to know about:** reviewers may object to the yt-dlp download (policy 10.2.2, code not in
the package) or to downloading from YouTube (policy 10.1.4, content rights). If rejected, the
usual fix is bundling yt-dlp in the package and updating it only through Store updates.

## Store listing

### English

**Short description**
Fast, free download manager: files, videos, music and whole playlists, with browser integration.

**Description**
Downly is a fast, free download manager with no ads and no limits.

• Up to 32× faster downloads over multiple connections
• Pause and resume, even after restarting your PC
• Videos and music from YouTube and 1000+ sites, in the quality you choose
• Audio only (MP3, M4A…), whole playlists, and Spotify songs with title, artist and cover
• Browser extension for Chrome, Edge, Brave, Opera, Vivaldi and Firefox: browser downloads go
  to Downly, and a Download button appears on videos
• Scheduler, speed limit, and automatic sorting into folders
• English and Arabic, light and dark theme

Please only download content you have the right to download.

**Features** (one per line in Partner Center)
Multi-connection downloads up to 32× faster
Pause and resume downloads
Videos and audio from YouTube and 1000+ sites
Whole playlists and Spotify songs
Browser integration for all major browsers
Scheduler and speed limit

**Search terms**: download manager, video downloader, youtube downloader, mp3, playlist,
accelerator, idm

### العربية

**وصف قصير**
مدير تحميل سريع ومجاني: ملفات وفيديوهات وأغاني وقوايم تشغيل كاملة، ومربوط بالمتصفح.

**الوصف**
Downly مدير تحميل سريع ومجاني، من غير إعلانات ومن غير حدود.

• تحميل أسرع لحد 32 مرة بأكتر من اتصال
• إيقاف واستكمال التحميل حتى بعد ما تقفل الجهاز
• فيديوهات وأغاني من يوتيوب وأكتر من 1000 موقع بالجودة اللي تختارها
• صوت بس (MP3، M4A…)، وقوايم تشغيل كاملة، وأغاني سبوتيفاي باسمها وصورتها
• إضافة للمتصفح (كروم، إيدج، بريف، أوبرا، فيفالدي، فايرفوكس): تحميلات المتصفح بتروح لـ Downly، وزرار تحميل بيظهر على الفيديوهات
• جدولة، وتحديد السرعة، وترتيب الملفات في فولدرات لوحدها
• عربي وإنجليزي، وثيم فاتح وغامق

من فضلك حمّل بس المحتوى اللي من حقك تحمّله.
