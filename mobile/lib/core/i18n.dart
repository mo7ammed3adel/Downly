import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import 'settings.dart';

/// Arabic and English strings. `context.tr('key')` picks the app language.
const _strings = <String, Map<String, String>>{
  'appName': {'en': 'Downly', 'ar': 'Downly'},
  // navigation
  'home': {'en': 'Home', 'ar': 'الرئيسية'},
  'browser': {'en': 'Browser', 'ar': 'المتصفح'},
  'downloads': {'en': 'Downloads', 'ar': 'التحميلات'},
  'library': {'en': 'Library', 'ar': 'المكتبة'},
  'musicTab': {'en': 'Music', 'ar': 'أغاني'},
  'settings': {'en': 'Settings', 'ar': 'الإعدادات'},
  // home
  'pasteHint': {'en': 'Paste a link or search YouTube', 'ar': 'الصق لينك أو دوّر في يوتيوب'},
  'paste': {'en': 'Paste', 'ar': 'لصق'},
  'go': {'en': 'Go', 'ar': 'يلا'},
  'heroTitle': {'en': 'Download anything,\nin a tap.', 'ar': 'حمّل أي حاجة،\nبضغطة واحدة.'},
  'quickSites': {'en': 'Quick sites', 'ar': 'مواقع سريعة'},
  'recent': {'en': 'Recent downloads', 'ar': 'آخر التحميلات'},
  'seeAll': {'en': 'See all', 'ar': 'الكل'},
  'tipShareTitle': {'en': 'Share → Downly', 'ar': 'شير ← Downly'},
  'tipShare': {
    'en': 'In YouTube, TikTok or Instagram tap Share and pick Downly. The download sheet opens right away.',
    'ar': 'من يوتيوب أو تيك توك أو إنستجرام دوس Share واختار Downly، وشاشة التحميل هتفتح على طول.'
  },
  'clipboardFound': {'en': 'Link copied. Download it?', 'ar': 'نسخت لينك. تحمّله؟'},
  'download': {'en': 'Download', 'ar': 'تحميل'},
  'preparing': {'en': 'Getting Downly ready… (first time only)', 'ar': 'بنجهّز Downly… (أول مرة بس)'},
  // sheet
  'video': {'en': 'Video', 'ar': 'فيديو'},
  'audio': {'en': 'Audio', 'ar': 'صوت'},
  'loadingInfo': {'en': 'Reading the link…', 'ar': 'بنقرا اللينك…'},
  'retry': {'en': 'Try again', 'ar': 'حاول تاني'},
  'downloadAsFile': {'en': 'Download as a file', 'ar': 'حمّله كملف'},
  'privateDownload': {'en': 'Save to the vault (private)', 'ar': 'احفظه في الخزنة (خاص)'},
  'privateHint': {'en': 'Hidden from the gallery, opens with your PIN', 'ar': 'مش هيظهر في الاستوديو، ويتفتح بالرقم السري'},
  'playlist': {'en': 'Playlist', 'ar': 'قايمة تشغيل'},
  'items': {'en': 'items', 'ar': 'عنصر'},
  'selectAll': {'en': 'Select all', 'ar': 'اختار الكل'},
  'downloadN': {'en': 'Download {n}', 'ar': 'حمّل {n}'},
  'added': {'en': 'Added to downloads', 'ar': 'اتضاف للتحميلات'},
  'bestQuality': {'en': 'Best', 'ar': 'أعلى جودة'},
  'foundOnPage': {'en': 'Found on this page', 'ar': 'لقيناه في الصفحة'},
  // downloads
  'active': {'en': 'In progress', 'ar': 'شغّال'},
  'finished': {'en': 'Finished', 'ar': 'خلص'},
  'queued': {'en': 'Waiting…', 'ar': 'مستني…'},
  'starting': {'en': 'Starting…', 'ar': 'بيبدأ…'},
  'merging': {'en': 'Merging video and audio…', 'ar': 'بندمج الصوت مع الفيديو…'},
  'converting': {'en': 'Converting…', 'ar': 'بنحوّل…'},
  'finishing': {'en': 'Finishing…', 'ar': 'بنقفل…'},
  'paused': {'en': 'Paused', 'ar': 'متوقف'},
  'failed': {'en': 'Failed', 'ar': 'فشل'},
  'done': {'en': 'Done', 'ar': 'خلص'},
  'noDownloads': {'en': 'Nothing here yet', 'ar': 'مفيش حاجة لسه'},
  'noDownloadsHint': {'en': 'Paste a link on the home screen or open the browser.', 'ar': 'الصق لينك في الرئيسية أو افتح المتصفح.'},
  'pause': {'en': 'Pause', 'ar': 'إيقاف'},
  'resume': {'en': 'Resume', 'ar': 'كمّل'},
  'cancel': {'en': 'Cancel', 'ar': 'إلغاء'},
  'delete': {'en': 'Delete', 'ar': 'مسح'},
  'deleteFile': {'en': 'Also delete the file', 'ar': 'امسح الملف كمان'},
  'share': {'en': 'Share', 'ar': 'مشاركة'},
  'play': {'en': 'Play', 'ar': 'تشغيل'},
  'moveToVault': {'en': 'Move to vault', 'ar': 'انقله للخزنة'},
  'clearFinished': {'en': 'Clear finished', 'ar': 'امسح اللي خلص'},
  'copyLink': {'en': 'Copy link', 'ar': 'انسخ اللينك'},
  'copied': {'en': 'Copied', 'ar': 'اتنسخ'},
  'left': {'en': 'left', 'ar': 'فاضل'},
  // library
  'videos': {'en': 'Videos', 'ar': 'فيديوهات'},
  'music': {'en': 'Music', 'ar': 'أغاني'},
  'files': {'en': 'Files', 'ar': 'ملفات'},
  'vault': {'en': 'Vault', 'ar': 'الخزنة'},
  'vaultCard': {'en': 'Private videos, locked with your PIN', 'ar': 'فيديوهاتك الخاصة، مقفولة برقمك السري'},
  'emptyLibrary': {'en': 'Your downloads show up here', 'ar': 'تحميلاتك هتظهر هنا'},
  'savedIn': {'en': 'Saved in Download/Downly', 'ar': 'متخزنة في Download/Downly'},
  // vault
  'createPin': {'en': 'Create a 4-digit PIN', 'ar': 'اعمل رقم سري من 4 أرقام'},
  'confirmPin': {'en': 'Enter it again', 'ar': 'اكتبه تاني'},
  'enterPin': {'en': 'Enter your PIN', 'ar': 'اكتب الرقم السري'},
  'wrongPin': {'en': 'Wrong PIN', 'ar': 'الرقم غلط'},
  'pinMismatch': {'en': "PINs don't match", 'ar': 'الرقمين مش زي بعض'},
  'useFingerprint': {'en': 'Use fingerprint', 'ar': 'استخدم البصمة'},
  'unlockVault': {'en': 'Unlock the vault', 'ar': 'افتح الخزنة'},
  'vaultEmpty': {'en': 'The vault is empty', 'ar': 'الخزنة فاضية'},
  'vaultEmptyHint': {
    'en': 'Move videos here from the library, or pick "Save to the vault" when you download.',
    'ar': 'انقل فيديوهات هنا من المكتبة، أو اختار "احفظه في الخزنة" وإنت بتحمّل.'
  },
  'restore': {'en': 'Move back to gallery', 'ar': 'رجّعه للاستوديو'},
  'lock': {'en': 'Lock', 'ar': 'اقفل'},
  'movedToVault': {'en': 'Moved to the vault 🔒', 'ar': 'اتنقل للخزنة 🔒'},
  'restored': {'en': 'Back in Download/Downly', 'ar': 'رجع لـ Download/Downly'},
  // browser
  'searchOrUrl': {'en': 'Search or type a link', 'ar': 'دوّر أو اكتب لينك'},
  'downloadThis': {'en': 'Download', 'ar': 'حمّل'},
  'desktopSite': {'en': 'Desktop site', 'ar': 'نسخة الكمبيوتر'},
  'openInBrowser': {'en': 'Open in browser', 'ar': 'افتح في المتصفح'},
  'reload': {'en': 'Reload', 'ar': 'تحديث'},
  'browserHome': {'en': 'Home page', 'ar': 'الصفحة الرئيسية'},
  'loginTip': {
    'en': 'Log in to Instagram or Facebook here, and Downly can download private videos too.',
    'ar': 'سجّل دخول إنستجرام أو فيسبوك هنا، وDownly هيقدر يحمّل الفيديوهات الخاصة كمان.'
  },
  // settings
  'language': {'en': 'Language', 'ar': 'اللغة'},
  'theme': {'en': 'Theme', 'ar': 'الشكل'},
  'dark': {'en': 'Dark', 'ar': 'غامق'},
  'light': {'en': 'Light', 'ar': 'فاتح'},
  'system': {'en': 'System', 'ar': 'زي الموبايل'},
  'defaultQuality': {'en': 'Default video quality', 'ar': 'جودة الفيديو الافتراضية'},
  'audioFormat': {'en': 'Audio format', 'ar': 'صيغة الصوت'},
  'parallel': {'en': 'Downloads at the same time', 'ar': 'عدد التحميلات مع بعض'},
  'clipboardWatch': {'en': 'Detect copied links', 'ar': 'اكتشف اللينكات المنسوخة'},
  'subtitles': {'en': 'Embed subtitles', 'ar': 'ضيف الترجمة جوه الفيديو'},
  'engine': {'en': 'Download engine', 'ar': 'محرك التحميل'},
  'updateEngine': {'en': 'Update now', 'ar': 'حدّثه دلوقتي'},
  'engineUpdated': {'en': 'Engine is up to date', 'ar': 'المحرك محدّث'},
  'engineHint': {
    'en': 'If a site stops working, updating the engine usually fixes it.',
    'ar': 'لو موقع وقف يحمّل، تحديث المحرك غالبًا بيحلها.'
  },
  'changePin': {'en': 'Change vault PIN', 'ar': 'غيّر رقم الخزنة'},
  'fingerprint': {'en': 'Unlock with fingerprint', 'ar': 'افتح بالبصمة'},
  'about': {'en': 'About', 'ar': 'عن Downly'},
  'website': {'en': 'Website & desktop app', 'ar': 'الموقع وبرنامج الكمبيوتر'},
  'support': {'en': 'Support Downly', 'ar': 'ادعم Downly'},
  'legal': {
    'en': 'Please only download content you have the right to download.',
    'ar': 'من فضلك حمّل بس المحتوى اللي من حقك تحمّله.'
  },
  'general': {'en': 'General', 'ar': 'عام'},
  'downloadsSection': {'en': 'Downloads', 'ar': 'التحميل'},
  'speed': {'en': 'Playback speed', 'ar': 'سرعة التشغيل'},
  'error': {'en': 'Something went wrong', 'ar': 'حصلت مشكلة'},
  'updatingEngine': {'en': 'Updating the download engine…', 'ar': 'بنحدّث محرك التحميل…'},
  // friendly errors: err_<kind>_t is the title, err_<kind> the explanation
  'err_login_t': {'en': '{site} wants you to log in', 'ar': '{site} عاوزك تسجّل دخول'},
  'err_login': {
    'en': 'This one is private, or {site} only shows it to logged-in people. Log in once in Downly’s browser and it will download.',
    'ar': 'الفيديو ده خاص، أو {site} مش بيعرضه غير للي عامل تسجيل دخول. سجّل دخول مرة واحدة في متصفح Downly وهيتحمّل.'
  },
  'loginTo': {'en': 'Log in to {site}', 'ar': 'سجّل دخول {site}'},
  'loginThenContinue': {'en': 'Log in, then tap Continue to download your link.', 'ar': 'سجّل دخولك، وبعدين دوس «كمّل» عشان تحمّل اللينك.'},
  'continueDownload': {'en': 'Continue', 'ar': 'كمّل'},
  'err_outdated_t': {'en': "{site} didn't allow the download", 'ar': '{site} رفض التحميل'},
  'err_outdated': {
    'en': 'We updated the download engine and tried again. Wait a few minutes and try once more.',
    'ar': 'حدّثنا محرك التحميل وجرّبنا تاني. استنى كام دقيقة وحاول مرة كمان.'
  },
  'err_unsupported_t': {'en': 'No video or audio here', 'ar': 'مفيش فيديو أو صوت هنا'},
  'err_unsupported': {
    'en': "This link isn't a video or song we can download. If it's a file, download it as a file.",
    'ar': 'اللينك ده مش لفيديو أو أغنية نقدر نحمّلها. لو ملف، حمّله كملف.'
  },
  'err_network_t': {'en': 'No connection', 'ar': 'مفيش اتصال'},
  'err_network': {'en': 'Check your internet and try again.', 'ar': 'اتأكد من النت وحاول تاني.'},
  'err_unavailable_t': {'en': 'Not available', 'ar': 'مش متاح'},
  'err_unavailable': {'en': 'This video was removed or is not available in your country.', 'ar': 'الفيديو ده اتمسح أو مش متاح في بلدك.'},
  'err_other_t': {'en': 'Something went wrong', 'ar': 'حصلت مشكلة'},
  // updates
  'updateTitle': {'en': 'Downly {v} is here', 'ar': 'نزل Downly {v}'},
  'updateNow': {'en': 'Update', 'ar': 'حدّث'},
  'install': {'en': 'Install', 'ar': 'سطّب'},
  'later': {'en': 'Later', 'ar': 'بعدين'},
  'updateInstalling': {'en': 'Opening the installer…', 'ar': 'بنفتح شاشة التسطيب…'},
  'appVersion': {'en': 'App version', 'ar': 'نسخة التطبيق'},
  'checkUpdates': {'en': 'Check for updates', 'ar': 'دوّر على تحديث'},
  'upToDate': {'en': "You're on the latest version", 'ar': 'إنت على آخر نسخة'},
  // tools on home
  'tools': {'en': 'Tools', 'ar': 'أدوات'},
  'musicPlayer': {'en': 'Music player', 'ar': 'مشغّل الأغاني'},
  'musicPlayerHint': {'en': 'Keeps playing with the screen off', 'ar': 'بيشتغل والشاشة مقفولة'},
  'statusSaver': {'en': 'WhatsApp statuses', 'ar': 'حالات واتساب'},
  'statusSaverHint': {'en': 'Save photos and videos', 'ar': 'احفظ الصور والفيديوهات'},
  // music
  'songs': {'en': 'Songs', 'ar': 'الأغاني'},
  'allSongs': {'en': 'All', 'ar': 'الكل'},
  'fromDownly': {'en': 'Downloaded', 'ar': 'اللي نزّلتها'},
  'shuffleAll': {'en': 'Shuffle', 'ar': 'عشوائي'},
  'playAll': {'en': 'Play all', 'ar': 'شغّل الكل'},
  'searchSongs': {'en': 'Search songs', 'ar': 'دوّر على أغنية'},
  'noSongs': {'en': 'No songs yet', 'ar': 'مفيش أغاني لسه'},
  'noSongsHint': {
    'en': 'Download a song as audio (MP3) and it shows up here.',
    'ar': 'حمّل أي أغنية كصوت (MP3) وهتظهر هنا.'
  },
  'allowMusic': {'en': 'Show all the songs on this phone', 'ar': 'اعرض كل الأغاني اللي على الموبايل'},
  'allow': {'en': 'Allow', 'ar': 'اسمح'},
  'nowPlaying': {'en': 'Now playing', 'ar': 'شغّال دلوقتي'},
  'queue': {'en': 'Up next', 'ar': 'اللي جاي'},
  'sleepTimer': {'en': 'Sleep timer', 'ar': 'مؤقت النوم'},
  'sleepOff': {'en': 'Off', 'ar': 'مقفول'},
  'sleepIn': {'en': 'Stops in {m} min', 'ar': 'هيقف بعد {m} دقيقة'},
  'minutes': {'en': '{m} minutes', 'ar': '{m} دقيقة'},
  'hour': {'en': '1 hour', 'ar': 'ساعة'},
  'unknownArtist': {'en': 'Unknown artist', 'ar': 'فنان مش معروف'},
  // statuses
  'photos': {'en': 'Photos', 'ar': 'صور'},
  'whatsapp': {'en': 'WhatsApp', 'ar': 'واتساب'},
  'business': {'en': 'Business', 'ar': 'بيزنس'},
  'statusAccessTitle': {'en': 'Allow Downly to see statuses', 'ar': 'اسمح لـ Downly يشوف الحالات'},
  'statusAccessBody': {
    'en': 'Android shows a folder screen once. Just tap "Use this folder", then "Allow".',
    'ar': 'الأندرويد هيفتحلك شاشة فولدر مرة واحدة بس. دوس «Use this folder» وبعدين «Allow».'
  },
  'wrongFolder': {
    'en': "That wasn't the statuses folder. Tap Allow again and don't change folders.",
    'ar': 'ده مش فولدر الحالات. دوس اسمح تاني ومتغيّرش الفولدر.'
  },
  'noStatuses': {'en': 'No statuses yet', 'ar': 'مفيش حالات'},
  'noStatusesHint': {
    'en': 'Open WhatsApp and watch some statuses, then come back here.',
    'ar': 'افتح واتساب واتفرج على شوية حالات، وارجع هنا.'
  },
  'save': {'en': 'Save', 'ar': 'حفظ'},
  'saved': {'en': 'Saved', 'ar': 'اتحفظ'},
  'savedTo': {'en': 'Saved in Download/Downly/Statuses', 'ar': 'اتحفظ في Download/Downly/Statuses'},
  'saveN': {'en': 'Save {n}', 'ar': 'احفظ {n}'},
  'repost': {'en': 'Repost', 'ar': 'انشرها'},
};

/// The whole app is rebuilt when the language changes (see app.dart), so reading without
/// listening is enough and works inside callbacks too.
String translate(String lang, String key, {Map<String, Object>? args}) {
  var text = _strings[key]?[lang] ?? _strings[key]?['en'] ?? key;
  args?.forEach((k, v) => text = text.replaceAll('{$k}', '$v'));
  return text;
}

extension Tr on BuildContext {
  String tr(String key, {Map<String, Object>? args}) =>
      translate(Provider.of<Settings>(this, listen: false).languageCode(this), key, args: args);
}
