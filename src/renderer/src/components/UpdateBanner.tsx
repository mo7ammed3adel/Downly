import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Sparkles } from 'lucide-react'
import type { UpdateState } from '@shared/types'

/** The connection dropped or the site couldn't be reached, rather than anything wrong with the update */
const NETWORK_ERROR = /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|aborted|timed out|stalled|socket hang up|incomplete/i

/** Tracks the app's own update state (pushed from the main process) */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    void window.api.getUpdateState().then(setState)
    return window.api.onUpdateState(setState)
  }, [])
  return state
}

/** Slim bar above the download list while a new version is available, downloading or installing */
export function UpdateBanner() {
  const { t } = useTranslation()
  const state = useUpdateState()
  const [later, setLater] = useState(false)

  if (state.status === 'downloading') {
    return (
      <div className="update-bar">
        <Download size={16} />
        <span>{t('update.downloading', { version: state.version, progress: state.progress })}</span>
        <div className="bar" style={{ flex: 1, maxWidth: 220 }}>
          <div style={{ width: `${state.progress}%` }} />
        </div>
      </div>
    )
  }
  if (state.status === 'installing') {
    return (
      <div className="update-bar">
        <Download size={16} />
        <span>{t('update.installing')}</span>
      </div>
    )
  }
  if (state.status !== 'available' || later) return null
  return (
    <div className="update-bar">
      <Sparkles size={16} />
      <span>
        {t('update.available', { version: state.version })}
        {state.error && (
          <span className="update-error">
            {' '}
            {NETWORK_ERROR.test(state.error) ? t('update.network') : t('update.failed', { error: state.error })}
          </span>
        )}
      </span>
      <span className="grow" />
      <button className="btn ghost" onClick={() => setLater(true)}>
        {t('update.later')}
      </button>
      <button className="btn primary" onClick={() => void window.api.installUpdate()}>
        {state.canInstall ? t('update.install') : t('update.download')}
      </button>
    </div>
  )
}
