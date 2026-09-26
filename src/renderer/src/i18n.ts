import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { isRtl, RESOURCES } from '@shared/i18n'

const resources = Object.fromEntries(Object.entries(RESOURCES).map(([lng, msgs]) => [lng, { translation: msgs }]))

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export function applyLanguage(lng: string): void {
  if (i18n.language !== lng) void i18n.changeLanguage(lng)
  document.documentElement.lang = lng
  document.documentElement.dir = isRtl(lng) ? 'rtl' : 'ltr'
}

export default i18n
