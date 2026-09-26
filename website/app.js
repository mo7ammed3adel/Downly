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
  // Store pages — fill in once the extension is published
  chrome: '',
  edge: '',
  firefox: ''
}

const latest = `https://github.com/${SITE.releasesRepo}/releases/latest/download`
const FILES = {
  win: `${latest}/Downly-Setup.exe`,
  win7: `${latest}/Downly-Setup-Win7-x64.exe`,
  win7x86: `${latest}/Downly-Setup-Win7-x86.exe`,
  mac: `${latest}/Downly-mac-arm64.dmg`,
  macIntel: `${latest}/Downly-mac-x64.dmg`,
  linux: `${latest}/Downly-linux.AppImage`,
  linuxDeb: `${latest}/Downly-linux.deb`
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
  'footer.privacy': 'الخصوصية',
  copied: 'اتنسخ ✓',
  'dl.win': 'تحميل للويندوز',
  'dl.mac': 'تحميل للماك',
  'dl.linux': 'تحميل للينكس',
  'dl.win7': 'تحميل لويندوز 7 / 8',
  'dl.win7x86': 'تحميل لويندوز 7 / 8 (32 بت)',
  soon: 'قريبًا على المتجر'
}
const EN_EXTRA = {
  copied: 'Copied ✓',
  'dl.win': 'Download for Windows',
  'dl.mac': 'Download for macOS',
  'dl.linux': 'Download for Linux',
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

// ?lang=ar in the URL wins (shareable links), then the saved choice, then the browser language
const urlLang = new URLSearchParams(location.search).get('lang')
let lang = ['ar', 'en'].includes(urlLang) ? urlLang : store.get('lang') || (navigator.language.startsWith('ar') ? 'ar' : 'en')
const t = (k) => (lang === 'ar' ? AR[k] : EN[k]) ?? EN[k] ?? k

function applyLang() {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
  document.getElementById('lang').textContent = lang === 'ar' ? 'English' : 'عربي'
  applyOs()
}

// ---------------------------------------------------------------- download button
function detectOs() {
  const ua = navigator.userAgent
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
  document.getElementById('mainDownloadIcon').setAttribute('href', { mac: '#i-apple', linux: '#i-linux' }[os] ?? '#i-windows')
  for (const a of document.querySelectorAll('.os-link')) a.href = FILES[a.dataset.os]
  for (const a of document.querySelectorAll('.download-link')) a.href = FILES[os]
}

document.getElementById('lang').addEventListener('click', () => {
  lang = lang === 'ar' ? 'en' : 'ar'
  store.set('lang', lang)
  applyLang()
})

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

// Social icons: every [data-social] link gets its URL (or disappears if empty)
for (const a of document.querySelectorAll('[data-social]')) {
  const url = SITE.social[a.dataset.social]
  if (url) a.href = url
  else a.hidden = true
}
document.getElementById('year').textContent = new Date().getFullYear()

applyLang()
