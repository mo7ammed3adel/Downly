import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import { IdmOptionsShot } from './BrowserShots'
import { Modal, closeDialog } from './ui'

/** Shown when Internet Download Manager is running: it grabs browser downloads before Downly */
export function IdmDialog() {
  const { t } = useTranslation()
  const dontShowAgain = async () => {
    await window.api.updateSettings({ onboarding: { idmDismissed: true } })
    closeDialog()
  }
  return (
    <Modal
      title={t('idm.title')}
      icon={<TriangleAlert size={18} />}
      onClose={closeDialog}
      wide
      footer={
        <>
          <button className="btn" onClick={dontShowAgain}>
            {t('idm.dontShow')}
          </button>
          <button className="btn primary" onClick={closeDialog}>
            {t('idm.ok')}
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0, fontSize: 13.5 }}>
        {t('idm.intro')}
      </p>
      <ol className="steps">
        <li>
          <strong>{t('idm.step1')}</strong>
        </li>
        <li>
          <strong>{t('idm.step2')}</strong>
          <span className="hint">{t('idm.step2Hint')}</span>
          <IdmOptionsShot />
        </li>
        <li>
          <strong>{t('idm.step3')}</strong>
        </li>
      </ol>
      <div className="note warn" style={{ marginTop: 16 }}>
        {t('idm.note')}
      </div>
    </Modal>
  )
}
