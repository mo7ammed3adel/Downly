import en from './locales/en.json'
import ar from './locales/ar.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import de from './locales/de.json'
import tr from './locales/tr.json'
import ru from './locales/ru.json'
import pt from './locales/pt.json'
import zh from './locales/zh.json'
import hi from './locales/hi.json'
import id from './locales/id.json'
import fa from './locales/fa.json'
import ur from './locales/ur.json'

export type Messages = typeof en

/** Add a language: drop a JSON file in ./locales and list it here. Missing keys fall back to English. */
export const SUPPORTED_LANGUAGES: { code: string; name: string; rtl?: boolean }[] = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ru', name: 'Русский' },
  { code: 'pt', name: 'Português' },
  { code: 'zh', name: '中文' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'fa', name: 'فارسی', rtl: true },
  { code: 'ur', name: 'اردو', rtl: true }
]

export const RESOURCES: Record<string, Record<string, unknown>> = { en, ar, fr, es, de, tr, ru, pt, zh, hi, id, fa, ur }

export const isRtl = (code: string) => !!SUPPORTED_LANGUAGES.find((l) => l.code === code)?.rtl

/** Tiny translator for the main process (tray, notifications) */
export function translate(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const lookup = (res: Record<string, unknown> | undefined) =>
    key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), res)
  const raw = lookup(RESOURCES[lang]) ?? lookup(RESOURCES.en) ?? key
  return String(raw).replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))
}
