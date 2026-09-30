// ---------------------------------------------------------------- site config (edit me)
const SITE = {
  // Public repo that only holds the installers (the source repo is private)
  releasesRepo: 'mo7ammed3adel/downly-releases',
  buyMeACoffee: 'https://buymeacoffee.com/mohamed3abuzaid',
  vodafoneCash: '01014025928',
  instapay: 'mohamed2abuzaid@instapay',
  instapayLink: 'https://ipn.eg/S/mohamed2abuzaid/instapay/90WeD3',
  social: {
    facebook: 'https://www.facebook.com/mo7ammedbondok',
    instagram: 'https://www.instagram.com/mo7ammed3adel/',
    whatsapp: 'https://wa.me/201014025928',
    telegram: 'https://t.me/mohamed3abuzaid'
  },
  // Windows 10/11 app on the Microsoft Store
  msStore: 'https://apps.microsoft.com/detail/9N3LXLPF25K4',
  // Store pages — fill in once the extension is published
  chrome: '',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/edoonifkeddgpamlhadfbagimigcaena',
  // Signed by Mozilla in the release pipeline (swap for the addons.mozilla.org page once listed)
  firefox: 'https://github.com/mo7ammed3adel/downly-releases/releases/latest/download/Downly-firefox.xpi',
  // The Android app has its own releases (android-vX.Y.Z) so desktop "latest" links keep working;
  // bump this tag when a new APK is published
  androidTag: 'android-v1.1.0'
}

const latest = `https://github.com/${SITE.releasesRepo}/releases/latest/download`
const FILES = {
  win: `${latest}/Downly-Setup.exe`,
  win7: `${latest}/Downly-Setup-Win7-x64.exe`,
  win7x86: `${latest}/Downly-Setup-Win7-x86.exe`,
  mac: `${latest}/Downly-mac-arm64.dmg`,
  macIntel: `${latest}/Downly-mac-x64.dmg`,
  linux: `${latest}/Downly-linux.AppImage`,
  linuxDeb: `${latest}/Downly-linux.deb`,
  android: `https://github.com/${SITE.releasesRepo}/releases/download/${SITE.androidTag}/Downly-android-arm64.apk`,
  androidArm32: `https://github.com/${SITE.releasesRepo}/releases/download/${SITE.androidTag}/Downly-android-arm32.apk`
}

// ---------------------------------------------------------------- translations
// English lives in the HTML; this is the Arabic version of every data-i18n key.
const AR = {
  'nav.features': 'المميزات',
  'nav.extension': 'الإضافة',
  'nav.support': 'ادعمنا',
  'nav.faq': 'أسئلة',
  'nav.download': 'تحميل',
  'hero.pill': 'مجاني للأبد · من غير إعلانات · من غير حدود',
  'hero.title': 'حمّل أي حاجة، أسرع.',
  'hero.lead': 'ملفات، فيديوهات يوتيوب والسوشيال ميديا، أغاني، قوايم تشغيل كاملة وأغاني سبوتيفاي — في برنامج واحد هادي، وتحميل أسرع لحد 32 مرة بأكتر من اتصال.',
  'hero.download': 'تحميل للويندوز',
  'hero.extension': 'إضافة المتصفح',
  'hero.msStore': 'Microsoft Store',
  'meta.free': 'مجاني، من غير إعلانات',
  'mock.done': 'تم',
  'mock.search': 'الصق رابط…',
  'sites.title': 'بيشتغل مع أكتر من 1000 موقع',
  'features.eyebrow': 'المميزات',
  'features.title': 'كل اللي محتاجه. ومفيش حاجة زيادة.',
  'f9.t': 'مربوط بالمتصفح',
  'f9.d': 'التحميلات من كروم وإيدج وفايرفوكس بتروح لـ Downly لوحدها.',
  'ext.eyebrow': 'إضافة المتصفح',
  'support.eyebrow': 'ادعمنا',
  'faq.eyebrow': 'أسئلة شائعة',
  'cta.title': 'ابدأ حمّل بشكل أذكى.',
  'f1.t': 'أسرع لحد 32 مرة',
  'f1.d': 'بيقسّم الملف لأجزاء ويحمّلها مع بعض، وبيوزّع الاتصالات تاني كل ما جزء يخلص.',
  'f2.t': 'إيقاف واستئناف',
  'f2.d': 'وقّف في أي وقت وكمّل بعدين — حتى لو قفلت الجهاز أو النت فصل.',
  'f3.t': 'فيديو بأي جودة',
  'f3.d': 'من 144p لحد 8K، بصيغة MP4 أو MKV أو WebM، مع الترجمة والغلاف.',
  'f4.t': 'صوت بس',
  'f4.d': 'احفظ أي فيديو MP3 أو M4A أو FLAC أو Opus، باسم الأغنية والفنان والغلاف.',
  'f5.t': 'قوايم تشغيل كاملة',
  'f5.d': 'اختار الفيديوهات اللي عايزها من القايمة وحمّلها كلها مرة واحدة.',
  'f6.t': 'أغاني سبوتيفاي',
  'f6.d': 'أغاني وألبومات وقوايم بتتحفظ بالاسم والفنان وغلاف الألبوم الصح.',
  'f7.t': 'جدولة',
  'f7.d': 'خلّي التحميل يبدأ بالليل، والجهاز يقفل لوحده لما كله يخلص.',
  'f8.t': 'بلغتك',
  'f8.d': '13 لغة منهم العربي والإنجليزي، ووضع فاتح وداكن جوه البرنامج.',
  'ext.title': 'ضغطة واحدة من المتصفح',
  'ext.l1': 'تحميلات المتصفح بتروح للبرنامج لوحدها',
  'ext.l2': 'زرار تحميل على الفيديوهات — تقدر تحركه أو تخفيه',
  'ext.l3': 'زرار ♪ للصوت بس، و ☰ لقايمة التشغيل كلها',
  'ext.l4': 'كليك يمين على أي رابط ← تحميل بواسطة Downly',
  'ext.l5': 'اختصارات: Alt+Shift+D (فيديو)، Alt+Shift+A (صوت)',
  'ext.btn': 'تحميل',
  'support.title': 'مجاني للأبد — وبيكمّل بدعمك',
  'support.lead': 'Downly من غير إعلانات ولا تتبع ولا نسخة مدفوعة. لو بيوفّر عليك وقت، تبرع بسيط بيخليه يفضل شغال ويتحدّث.',
  'support.bmc': 'اعزمني على قهوة',
  'support.copy': 'نسخ',
  'support.instapay': 'ادفع بإنستاباي',
  'support.scan': 'أو امسح الكود من تطبيق البنك',
  'support.free': 'مش قادر تتبرع؟ إنك تبعت Downly لصاحبك بيفرق معانا جدًا.',
  'faq.title': 'أسئلة',
  q1: 'هو مجاني فعلاً؟',
  a1: 'أيوه. كل المميزات مجانية من غير حدود ولا إعلانات ولا حساب. التبرع اختياري.',
  q2: 'هو آمن؟',
  a2: 'Downly مش بيجمع بياناتك ولا بيعرض إعلانات. وإضافة المتصفح بتكلم البرنامج اللي على جهازك بس.',
  q3: 'سبوتيفاي بيشتغل إزاي؟',
  a3: 'البرنامج بياخد بيانات الأغنية من سبوتيفاي، ويلاقي نفس الأغنية على يوتيوب، ويحفظها باسمها وفنانها وغلافها من سبوتيفاي.',
  q6: 'بيشتغل على ويندوز 7؟',
  a6: 'أيوه. فيه نسخة مخصوصة لويندوز 7 و8 و8.1 (32 و64 بت)، وزرار التحميل بيختارها لوحده.',
  q4: 'الويندوز بيقول إن البرنامج غير معروف',
  a4: 'ده بيظهر لأي برنامج جديد لحد ما ياخد سمعة. دوس “More info” وبعدين “Run anyway”.',
  q5: 'أقدر أحمّل أي حاجة؟',
  a5: 'من فضلك حمّل بس المحتوى اللي من حقك تحمّله، واحترم شروط كل موقع وحقوق النشر.',
  q0: 'يعني إيه Downly؟',
  a0: 'Downly برنامج تحميل مجاني للويندوز والماك ولينكس. بيخلي التحميل أسرع لحد 32 مرة لأنه بيقسم الملف على كذا اتصال في نفس الوقت، وبيحمّل فيديوهات وصوت من يوتيوب وأكتر من 1000 موقع تاني، وقوايم تشغيل كاملة وأغاني سبوتيفاي.',
  q8: 'هل Downly بديل مجاني لـ IDM (إنترنت داونلود مانجر)؟',
  a8: 'أيوه. زي IDM بيسرّع التحميل بأكتر من اتصال، وبياخد التحميلات من كروم وإيدج وفايرفوكس، وبيحط زرار تحميل على الفيديوهات. بس على عكس IDM، مفيهوش فترة تجريبية ولا نسخة مدفوعة، وكمان بيشتغل على الماك ولينكس.',
  q9: 'الإضافة بتشتغل على أنهي متصفحات؟',
  a9: 'كروم وإيدج وبريف وأوبرا وفيفالدي وفايرفوكس. ولو عندك ويندوز 10 أو 11 تقدر كمان تنزّل البرنامج من Microsoft Store.',
  'footer.privacy': 'الخصوصية',
  copied: 'اتنسخ ✓',
  'dl.win': 'تحميل للويندوز',
  'dl.mac': 'تحميل للماك',
  'dl.linux': 'تحميل للينكس',
  'dl.android': 'تحميل للأندرويد',
  ga1: 'افتح الملف اللي نزل',
  ga1d: 'دوس على Downly-android-arm64.apk من إشعار التحميل أو من فولدر Downloads.',
  ga2: 'اسمح للمتصفح يسطّب التطبيقات',
  ga2d: 'الأندرويد هيسألك مرة واحدة بس: دوس Settings، وفعّل «Allow from this source»، وارجع.',
  ga3: 'دوس «Install» وخلاص',
  ga3d: 'بعد كده اعمل Share لأي لينك فيديو واختار Downly، أو افتح التطبيق والصق اللينك.',
  gaOld: 'موبايلك قديم وبيقولك إن التطبيق مش متوافق؟ نزّل نسخة الـ 32 بت.',
  q10: 'فيه تطبيق للأندرويد؟',
  a10: 'أيوه. Downly للأندرويد بيحمّل فيديوهات وأغاني من يوتيوب وأكتر من 1000 موقع، وفيه متصفح بزرار تحميل، وحفظ حالات الواتساب، ومشغّل أغاني بيكمّل في الخلفية، وخزنة بالبصمة للفيديوهات الخاصة. نزّله من هنا كملف APK، لأن جوجل بلاي مش بيسمح بتطبيقات تحميل يوتيوب.',
  'dl.win7': 'تحميل لويندوز 7 / 8',
  'dl.win7x86': 'تحميل لويندوز 7 / 8 (32 بت)',
  soon: 'قريبًا على المتجر',
  'guide.eyebrow': 'التحميل بدأ',
  'guide.title': 'ثبّت Downly في كام ضغطة',
  gw1: 'افتح الملف اللي نزل',
  gw1d: 'دوس عليه من تحميلات المتصفح، أو هتلاقيه في فولدر Downloads على جهازك.',
  gw2: 'ظهرتلك شاشة زرقا؟ دوس «More info»',
  gw2d: 'Downly آمن، وويندوز بيطلّع الشاشة دي لأي برنامج جديد.',
  gw3: 'وبعدين دوس «Run anyway»',
  gw3d: 'في ويندوز 7 هتظهرلك رسالة تانية بدالها، دوس فيها على زرار Run علطول.',
  gw4: 'دوس «Install» وخلاص كده',
  gw4d: 'Downly هيفتح لوحده أول ما التسطيب يخلص.',
  gm1: 'اسحب Downly جوه Applications',
  gm1d: 'افتح الملف اللي نزل، واسحب أيقونة Downly على فولدر Applications اللي جنبها.',
  gm2: 'افتح Downly. لو الماك وقّفه، دوس «Done»',
  gm2d: 'Downly آمن، والماك بيعمل كده مع أي برنامج مش من متجر أبل.',
  gm3: 'افتح System Settings ← Privacy & Security، ودوس «Open Anyway»',
  gm3d: 'انزل لتحت لحد جزء Security، هتلاقي الزرار جنب رسالة Downly.',
  gm4: 'دوس «Open Anyway» تاني واكتب باسورد الماك',
  gm4d: 'ده بيحصل أول مرة بس.',
  gmOld: 'لو الماك نسخة 14 أو أقدم: دوس كليك يمين على Downly في Applications، واختار Open، وبعدين Open تاني.',
  gl1: '‎.deb‎ (أوبونتو، ديبيان، مينت)',
  gl1d: 'دوس دبل كليك على الملف علشان يفتح في Software Install، أو اكتب:',
  gl2: 'AppImage (أي توزيعة)',
  gl2d: 'كليك يمين على الملف ← Properties ← اسمح بتشغيله كبرنامج، وبعدين دبل كليك. أو اكتب:',
  showMe: 'وريني بالصور',
  'stat.downloads': 'مرة اتحمّل لحد دلوقتي',
  q7: 'الماك بيقول إن Downly مينفعش يتفتح',
  a7: 'الماك بيعمل كده مع البرامج اللي مش من متجر أبل. افتح System Settings ← Privacy & Security ودوس «Open Anyway» علشان يفتح.'
}
const EN_EXTRA = {
  copied: 'Copied ✓',
  'dl.win': 'Download for Windows',
  'dl.mac': 'Download for macOS',
  'dl.linux': 'Download for Linux',
  'dl.android': 'Download for Android',
  'dl.win7': 'Download for Windows 7 / 8',
  'dl.win7x86': 'Download for Windows 7 / 8 (32-bit)',
  soon: 'Coming soon to the store'
}

const EN = {}
for (const el of document.querySelectorAll('[data-i18n]')) EN[el.dataset.i18n] = el.textContent.trim()
Object.assign(EN, EN_EXTRA)

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode */
    }
  }
}

// English lives at / and Arabic at /ar (built by scripts/build-site.mjs), so search engines index both.
// ?lang= in the URL wins (old shared links), then the saved choice; Arabic browsers landing on / go to /ar.
const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en'
const urlLang = new URLSearchParams(location.search).get('lang')
const wanted = ['ar', 'en'].includes(urlLang) ? urlLang : store.get('lang') || (navigator.language.startsWith('ar') ? 'ar' : null)
if (wanted && wanted !== lang) location.replace((wanted === 'ar' ? '/ar' : '/') + location.hash)
const t = (k) => (lang === 'ar' ? AR[k] : EN[k]) ?? EN[k] ?? k

function applyLang() {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
  applyOs()
  applyStats()
}

// ---------------------------------------------------------------- download button
function detectOs() {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  // Windows 7 / 8 / 8.1 report NT 6.x; they need the Electron 22 build (32-bit PCs lack Win64/WOW64)
  const legacy = /Windows NT 6\.[0-3]/.exec(ua)
  if (legacy) return /Win64|WOW64|x64/i.test(ua) ? 'win7' : 'win7x86'
  const p = (navigator.userAgentData?.platform || navigator.platform || ua).toLowerCase()
  if (p.includes('mac')) return 'mac'
  if (p.includes('linux') && !p.includes('android')) return 'linux'
  return 'win'
}
const os = detectOs()

function applyOs() {
  const main = document.getElementById('mainDownload')
  main.href = FILES[os]
  document.getElementById('mainDownloadText').textContent = t(`dl.${os}`)
  document.getElementById('mainDownloadIcon').setAttribute('href', { mac: '#i-apple', linux: '#i-linux', android: '#i-android' }[os] ?? '#i-windows')
  for (const a of document.querySelectorAll('.os-link')) a.href = FILES[a.dataset.os]
  for (const a of document.querySelectorAll('.download-link')) a.href = FILES[os]
  // The Store build only runs on Windows 10/11
  const msStore = document.getElementById('msStoreLink')
  msStore.href = SITE.msStore
  msStore.hidden = os !== 'win' || !SITE.msStore
}

// ---------------------------------------------------------------- live release numbers
// Total downloads, latest version and file sizes, straight from the public releases repo.
// GitHub allows 60 anonymous requests an hour per visitor, so the answer is cached for 10 minutes.
const INSTALLERS = new Set(Object.values(FILES).map((url) => url.split('/').pop()))
let stats = null

async function loadStats() {
  const cached = JSON.parse(store.get('stats') || 'null')
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached
  const res = await fetch(`https://api.github.com/repos/${SITE.releasesRepo}/releases?per_page=100`)
  if (!res.ok) return cached
  const releases = await res.json()
  const published = releases.filter((r) => !r.draft && !r.prerelease)
  const latest = published.find((r) => !r.tag_name.startsWith('android-'))
  const android = published.find((r) => r.tag_name.startsWith('android-'))
  const fresh = {
    at: Date.now(),
    downloads: releases.flatMap((r) => r.assets).reduce((n, a) => n + (INSTALLERS.has(a.name) ? a.download_count : 0), 0),
    version: latest?.tag_name,
    androidVersion: android?.tag_name.replace('android-', ''),
    sizes: Object.fromEntries([...(latest?.assets ?? []), ...(android?.assets ?? [])].map((a) => [a.name, a.size]))
  }
  store.set('stats', JSON.stringify(fresh))
  return fresh
}

function applyStats() {
  if (!stats) return
  const num = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en')
  if (stats.downloads > 0) {
    document.getElementById('dlCount').textContent = num.format(stats.downloads)
    document.getElementById('dlStat').hidden = false
  }
  const version = os === 'android' ? stats.androidVersion : stats.version
  if (version) for (const el of document.querySelectorAll('.version')) el.textContent = version
  const size = stats.sizes[FILES[os].split('/').pop()]
  // Latin digits like the rest of the version line
  document.getElementById('dlSize').textContent = size ? ` · ${Math.round(size / 1048576)} MB` : ''
}

loadStats()
  .then((s) => {
    stats = s
    applyStats()
  })
  .catch(() => {
    /* offline or rate-limited: the page works without the numbers */
  })

// ---------------------------------------------------------------- install guide
// Opens next to every download (the download itself still starts) and from the FAQ
const guide = document.getElementById('guide')
const GUIDE_TAB = { win: 'win', win7: 'win', win7x86: 'win', mac: 'mac', macIntel: 'mac', linux: 'linux', linuxDeb: 'linux', android: 'android', androidArm32: 'android' }

function showGuideTab(tab) {
  for (const b of guide.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === tab)
  for (const panel of guide.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab
}
function openGuide(tab) {
  showGuideTab(tab)
  if (!guide.open) guide.showModal()
}

for (const a of document.querySelectorAll('#mainDownload, .os-link, .download-link')) {
  a.addEventListener('click', () => openGuide(GUIDE_TAB[a.dataset.os ?? os]))
}
for (const b of document.querySelectorAll('[data-guide]')) b.addEventListener('click', () => openGuide(b.dataset.guide))
for (const b of guide.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showGuideTab(b.dataset.tab))
document.getElementById('guideClose').addEventListener('click', () => guide.close())
// Click on the backdrop closes it
guide.addEventListener('click', (e) => e.target === guide && guide.close())

document.getElementById('lang').addEventListener('click', () => store.set('lang', lang === 'ar' ? 'en' : 'ar'))

// ---------------------------------------------------------------- support + links
function toast(text) {
  const el = document.getElementById('toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => el.classList.remove('show'), 1600)
}

document.getElementById('bmcLink').href = SITE.buyMeACoffee
document.getElementById('vfNumber').textContent = SITE.vodafoneCash
document.getElementById('ipNumber').textContent = SITE.instapay
if (!SITE.vodafoneCash) document.getElementById('egyptPay').hidden = true
if (!SITE.instapay) document.getElementById('instapayCard').hidden = true
document.getElementById('instapayLink').href = SITE.instapayLink
for (const btn of document.querySelectorAll('[data-copy]')) {
  const value = btn.dataset.copy === 'vf' ? SITE.vodafoneCash : SITE.instapay
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard blocked — the number is visible anyway */
    }
    toast(t('copied'))
  })
}

for (const [id, url] of [
  ['chromeLink', SITE.chrome],
  ['edgeLink', SITE.edge],
  ['firefoxLink', SITE.firefox]
]) {
  const a = document.getElementById(id)
  if (url) {
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
  } else {
    a.addEventListener('click', (e) => {
      e.preventDefault()
      toast(t('soon'))
    })
  }
}

// Firefox: once Mozilla approves the listed add-on, send people to its store page instead of the
// signed file (the API answers 401 while it isn't public)
fetch('https://addons.mozilla.org/api/v5/addons/addon/downly@downly.app/')
  .then((res) => (res.ok ? res.json() : null))
  .then((addon) => {
    if (addon?.status === 'public' && addon.url) document.getElementById('firefoxLink').href = addon.url
  })
  .catch(() => {
    /* offline or blocked: the signed file link stays */
  })

// Social icons: every [data-social] link gets its URL (or disappears if empty)
for (const a of document.querySelectorAll('[data-social]')) {
  const url = SITE.social[a.dataset.social]
  if (url) a.href = url
  else a.hidden = true
}
document.getElementById('year').textContent = new Date().getFullYear()

applyLang()
