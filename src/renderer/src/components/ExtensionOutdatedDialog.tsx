import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Modal, closeDialog } from './ui'

/** The browser still runs an older copy of the extension (it keeps the old code until reloaded) */
export function ExtensionOutdatedDialog() {
  const { t } = useTranslation()
  return (
    <Modal
      title={t('extOld.title')}
      icon={<RefreshCw size={18} />}
      onClose={closeDialog}
      footer={
        <button className="btn primary" onClick={closeDialog}>
          {t('idm.ok')}
        </button>
      }
    >
      <p className="hint" style={{ marginTop: 0, fontSize: 13.5 }}>
        {t('extOld.intro')}
      </p>
      <ol className="steps">
        <li>
          <strong>{t('extOld.restart')}</strong>
        </li>
        <li>
          <strong>{t('extOld.reload')}</strong>
          <span className="hint">{t('extOld.reloadHint')}</span>
        </li>
      </ol>
    </Modal>
  )
}
