import type { ReactNode } from 'react'
import { Globe } from 'lucide-react'
import { SOCIAL, SUPPORT } from '@shared/support'

/** Brand glyphs drawn as simple 24×24 icons (lucide dropped brand logos) */
const ICONS: Record<keyof typeof SOCIAL, ReactNode> = {
  facebook: (
    <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20.5 11.8a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 20.5 11.8z" />
      <path d="M9 8.6c.3-.5.6-.5 1-.5.3 0 .5.2.6.5l.6 1.5c.1.3 0 .5-.2.7l-.5.5c.6 1.1 1.5 2 2.6 2.6l.5-.5c.2-.2.4-.3.7-.2l1.5.6c.3.1.5.3.5.6 0 .4 0 .7-.5 1-.7.4-1.5.5-2.2.3-2.4-.7-4.3-2.6-5-5-.2-.7-.1-1.5.4-2.1z" fill="currentColor" stroke="none" />
    </>
  ),
  telegram: (
    <path d="M21 4 3 11l6 2m12-9-3 16-6-5m9-11L9 13m0 0v6l3-4" />
  )
}

const LABELS: Record<keyof typeof SOCIAL, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram'
}

/** Row of round icon buttons: website + social accounts */
export function SocialLinks() {
  const open = (url: string) => () => window.api.openExternal(url)
  return (
    <div className="social">
      {SUPPORT.website && (
        <button className="social-btn" title="Website" aria-label="Website" onClick={open(SUPPORT.website)}>
          <Globe size={17} />
        </button>
      )}
      {(Object.keys(SOCIAL) as (keyof typeof SOCIAL)[])
        .filter((k) => SOCIAL[k])
        .map((k) => (
          <button key={k} className={`social-btn ${k}`} title={LABELS[k]} aria-label={LABELS[k]} onClick={open(SOCIAL[k])}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[k]}
            </svg>
          </button>
        ))}
    </div>
  )
}
