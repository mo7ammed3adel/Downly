import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Trash2 } from 'lucide-react'
import { isHttpUrl } from '@shared/util'
import { useStore } from '../store'
import { Modal, closeDialog } from './ui'

export function DeleteDialog({ ids }: { ids: string[] }) {
  const { t } = useTranslation()
  const [withFiles, setWithFiles] = useState(false)
  const confirm = async () => {
    await window.api.remove(ids, withFiles)
    closeDialog()
  }
  return (
    <Modal
      title={t('dialogs.deleteTitle', { count: ids.length })}
      icon={<Trash2 size={18} />}
      onClose={closeDialog}
      footer={
        <>
          <button className="btn" onClick={closeDialog}>
            {t('dialogs.cancel')}
          </button>
          <button className="btn primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={confirm} autoFocus>
            {t('dialogs.confirm')}
          </button>
        </>
      }
    >
      <label className="check">
        <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />
        {t('dialogs.deleteFiles')}
      </label>
    </Modal>
  )
}

export function RefreshDialog({ id }: { id: string }) {
  const { t } = useTranslation()
  const item = useStore((s) => s.downloads[id])
  const [url, setUrl] = useState('')
  const ok = async () => {
    await window.api.refreshUrl(id, url.trim())
    closeDialog()
  }
  return (
    <Modal
      title={t('dialogs.refreshTitle')}
      icon={<Link2 size={18} />}
      onClose={closeDialog}
      footer={
        <>
          <button className="btn" onClick={closeDialog}>
            {t('dialogs.cancel')}
          </button>
          <button className="btn primary" disabled={!isHttpUrl(url.trim())} onClick={ok}>
            {t('dialogs.ok')}
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        {t('dialogs.refreshHint')}
      </p>
      <p style={{ fontWeight: 600, wordBreak: 'break-all' }}>{item?.fileName}</p>
      <input className="input" dir="ltr" autoFocus value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
    </Modal>
  )
}
