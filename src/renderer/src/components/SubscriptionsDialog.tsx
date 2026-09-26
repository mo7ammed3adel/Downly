import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, RefreshCw, Rss, Trash2, Video } from 'lucide-react'
import type { Subscription } from '@shared/types'
import { Modal, Segmented, closeDialog } from './ui'

/** Channels and playlists whose new videos download by themselves */
export function SubscriptionsDialog() {
  const { t } = useTranslation()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'video' | 'audio'>('video')
  const [adding, setAdding] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api.listSubscriptions().then(setSubs)
    return window.api.onSubscriptionsChanged((list) => setSubs([...list]))
  }, [])

  const add = async () => {
    if (!url.trim()) return
    setAdding(true)
    setError('')
    try {
      await window.api.addSubscription(url.trim(), mode)
      setUrl('')
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setAdding(false)
    }
  }

  const checkNow = async () => {
    setChecking(true)
    await window.api.checkSubscriptions().finally(() => setChecking(false))
  }

  const when = (ms?: number) => (ms ? new Date(ms).toLocaleString() : '—')

  return (
    <Modal
      title={t('subs.title')}
      icon={<Rss size={18} />}
      onClose={closeDialog}
      wide
      footer={
        <>
          <button className="btn" onClick={checkNow} disabled={checking || !subs.length}>
            <RefreshCw size={14} className={checking ? 'spin' : ''} /> {t('subs.checkNow')}
          </button>
          <button className="btn primary" onClick={closeDialog}>
            {t('ext.done')}
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0, fontSize: 13.5 }}>
        {t('subs.intro')}
      </p>
      <div className="path-box" style={{ marginBottom: 8 }}>
        <input
          className="input"
          dir="ltr"
          style={{ flex: 1 }}
          placeholder="https://www.youtube.com/@channel"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          disabled={adding}
        />
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as 'video' | 'audio')}
          options={[
            { value: 'video', label: <><Video size={15} /> {t('add.video')}</> },
            { value: 'audio', label: <><Music size={15} /> {t('add.audio')}</> }
          ]}
        />
        <button className="btn primary" onClick={add} disabled={adding || !url.trim()}>
          {adding ? <RefreshCw size={14} className="spin" /> : null} {t('subs.add')}
        </button>
      </div>
      {adding && <div className="hint">{t('subs.adding')}</div>}
      {error && <div className="note warn">{error}</div>}

      {subs.length === 0 ? (
        <div className="empty" style={{ minHeight: 140 }}>
          <Rss size={28} />
          <div>{t('subs.empty')}</div>
        </div>
      ) : (
        <div className="subs-list">
          {subs.map((s) => (
            <div key={s.id} className="subs-row">
              {s.mode === 'audio' ? <Music size={16} /> : <Video size={16} />}
              <div className="subs-main">
                <strong>{s.title}</strong>
                <span className="hint" dir="ltr">
                  {s.url}
                </span>
                <span className={s.error ? 'hint subs-error' : 'hint'}>
                  {s.error ? t('subs.failed', { error: s.error }) : t('subs.checked', { when: when(s.lastChecked) })}
                </span>
              </div>
              <button className="btn ghost icon" title={t('subs.remove')} aria-label={t('subs.remove')} onClick={() => window.api.removeSubscription(s.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
