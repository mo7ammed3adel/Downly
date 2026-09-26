import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, LifeBuoy } from 'lucide-react'
import { Modal, closeDialog } from './ui'

/** Collects what went wrong, saves a report on the desktop and opens our WhatsApp chat */
export function ReportDialog() {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      setSaved(await window.api.createReport(note))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('report.title')}
      icon={<LifeBuoy size={18} />}
      onClose={closeDialog}
      footer={
        saved ? (
          <button className="btn primary" onClick={closeDialog}>
            {t('ext.done')}
          </button>
        ) : (
          <button className="btn primary" onClick={create} disabled={busy}>
            {t('report.create')}
          </button>
        )
      }
    >
      <p className="hint" style={{ marginTop: 0, fontSize: 13.5 }}>
        {t('report.intro')}
      </p>
      <textarea
        className="input"
        rows={5}
        style={{ width: '100%', resize: 'vertical' }}
        placeholder={t('report.placeholder')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={!!saved}
      />
      <p className="hint">{t('report.contains')}</p>
      {saved && (
        <div className="note success">
          <Check size={18} /> {t('report.done', { name: saved.split(/[\\/]/).pop() })}
        </div>
      )}
      {error && <div className="note warn">{t('report.failed', { error })}</div>}
    </Modal>
  )
}
