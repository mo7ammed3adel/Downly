/* Extension strings. The language is chosen in the popup (auto / English / العربية),
   independent of the browser language. Shared by background, popup and content script. */
;(() => {
  const MESSAGES = {
    en: {
      menuDownloadLink: 'Download with Downly',
      menuDownloadMedia: 'Download this video/audio with Downly',
      menuDownloadPage: 'Download video from this page',
      menuDownloadAll: 'Download all links with Downly',
      connected: 'Connected',
      disconnected: 'Downly is not running',
      disconnectedHint: 'Open the Downly app, then try again.',
      takeOver: 'Send browser downloads to Downly',
      pageVideo: 'Download video from this page',
      grabLinks: 'Download all links on this page',
      detected: 'Files found on this page',
      noneDetected: 'Nothing found yet. Play the video, then open this again.',
      streamsHint: 'This site sends video and sound separately. Use “Download video from this page” to get the full video with sound and pick the quality.',
      download: 'Download',
      sent: 'Sent',
      overlay: 'Download',
      overlaySection: 'Download button on videos',
      overlayShow: 'Show the button on videos',
      overlayCorner: 'Button position',
      cornerTR: 'Top right',
      cornerTL: 'Top left',
      cornerBR: 'Bottom right',
      cornerBL: 'Bottom left',
      overlaySite: 'Hide it on',
      overlayReset: 'Reset position',
      overlayRestore: 'Show hidden buttons',
      overlayHint: 'Drag the button to move it (remembered per site). Click × to hide it on the current video.',
      hideHere: 'Hide on this video',
      sendFailed: 'Couldn’t reach Downly.',
      doneLabel: 'Done',
      language: 'Language',
      langAuto: 'Auto (browser)',
      video: 'Video',
      audio: 'Audio',
      stream: 'Stream',
      playlistBtn: 'Download playlist',
      songBtn: 'Download song',
      songBtnTitle: 'Download the song that is playing with Downly',
      rowBtn: 'Download this song',
      allSongsBtn: 'Download all songs',
      quickMode: 'Quick download (no dialog)',
      quickHint: 'Clicking Download or ♪ starts right away with your default quality from the app settings.'
    },
    ar: {
      menuDownloadLink: 'تحميل بواسطة Downly',
      menuDownloadMedia: 'تحميل الفيديو/الصوت ده بواسطة Downly',
      menuDownloadPage: 'تحميل الفيديو من الصفحة دي',
      menuDownloadAll: 'تحميل كل الروابط بواسطة Downly',
      connected: 'متصل',
      disconnected: 'برنامج Downly مش مفتوح',
      disconnectedHint: 'افتح برنامج Downly وجرب تاني.',
      takeOver: 'تحويل تحميلات المتصفح للبرنامج',
      pageVideo: 'تحميل الفيديو من الصفحة دي',
      grabLinks: 'تحميل كل الروابط في الصفحة',
      detected: 'ملفات لقيناها في الصفحة',
      noneDetected: 'لسه ملقيناش حاجة. شغّل الفيديو وافتح النافذة دي تاني.',
      streamsHint: 'الموقع ده بيبعت الصورة والصوت منفصلين. استخدم «تحميل الفيديو من الصفحة دي» علشان تاخد الفيديو كامل بالصوت وتختار الجودة.',
      download: 'تحميل',
      sent: 'اتبعت',
      overlay: 'تحميل',
      overlaySection: 'زرار التحميل على الفيديوهات',
      overlayShow: 'إظهار الزرار على الفيديوهات',
      overlayCorner: 'مكان الزرار',
      cornerTR: 'فوق يمين',
      cornerTL: 'فوق شمال',
      cornerBR: 'تحت يمين',
      cornerBL: 'تحت شمال',
      overlaySite: 'إخفاؤه في',
      overlayReset: 'رجّع المكان الأصلي',
      overlayRestore: 'إظهار الأزرار المخفية',
      overlayHint: 'اسحب الزرار وحطه في أي مكان (بيتحفظ لكل موقع). اضغط × علشان تخفيه من الفيديو الحالي.',
      hideHere: 'إخفاء من الفيديو ده',
      sendFailed: 'مش قادر يوصل لبرنامج Downly.',
      doneLabel: 'تم',
      language: 'اللغة',
      langAuto: 'تلقائي (لغة المتصفح)',
      video: 'فيديو',
      audio: 'صوت',
      stream: 'بث',
      playlistBtn: 'تحميل قائمة التشغيل',
      songBtn: 'تحميل الأغنية',
      songBtnTitle: 'حمّل الأغنية اللي شغالة دلوقتي بـ Downly',
      rowBtn: 'حمّل الأغنية دي',
      allSongsBtn: 'تحميل كل الأغاني',
      quickMode: 'تحميل سريع (من غير نافذة)',
      quickHint: 'الضغط على تحميل أو ♪ بيبدأ التحميل على طول بالجودة الافتراضية من إعدادات البرنامج.'
    }
  }

  const ext = globalThis.browser ?? globalThis.chrome
  let lang = 'en'

  function resolve(pref) {
    if (pref === 'en' || pref === 'ar') return pref
    const ui = (ext.i18n?.getUILanguage?.() || navigator.language || 'en').toLowerCase()
    return ui.startsWith('ar') ? 'ar' : 'en'
  }

  globalThis.SG_I18N = {
    /** Loads the saved preference; call before rendering */
    async load() {
      const { lang: pref } = await ext.storage.local.get({ lang: 'auto' })
      lang = resolve(pref)
      return lang
    },
    get lang() {
      return lang
    },
    get rtl() {
      return lang === 'ar'
    },
    t(key) {
      return MESSAGES[lang]?.[key] ?? MESSAGES.en[key] ?? key
    }
  }
})()
