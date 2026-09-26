import { useTranslation } from 'react-i18next'
import { Gauge } from 'lucide-react'
import { formatBytes } from '@shared/util'
import { useStore } from '../store'

export function StatusBar() {
  const { t } = useTranslation()
  const downloads = useStore((s) => s.downloads)
  const components = useStore((s) => s.components)
  const version = useStore((s) => s.version)

  const active = Object.values(downloads).filter((d) => d.status === 'downloading' || d.status === 'processing')
  const speed = active.reduce((sum, d) => sum + (d.speed || 0), 0)
  const y = components.ytdlp

  return (
    <footer className="statusbar">
      <span className="item">
        <Gauge size={14} /> {t('statusbar.speed')}: {formatBytes(speed)}/s
      </span>
      <span className="item">{t('statusbar.active', { count: active.length })}</span>
      <span style={{ flex: 1 }} />
      <span className="item" title={y.error}>
        <span className={`dot ${y.busy ? 'busy' : y.ready ? 'ok' : 'bad'}`} />
        {y.busy ? t('statusbar.preparing') : y.ready ? t('statusbar.ready', { version: y.version ?? '' }) : t('statusbar.missing')}
      </span>
      <span className="item">
        v{version}
      </span>
    </footer>
  )
}
