import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Coffee, Copy, Github, Heart, Share2 } from 'lucide-react'
import { SUPPORT } from '@shared/support'
import { Modal, closeDialog } from './ui'
import instapayQr from '../assets/instapay-qr.png'
import { SocialLinks } from './SocialLinks'

/** Downly is free: this is where users can chip in. Empty links in SUPPORT are hidden. */
export function SupportDialog() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState('')
  const copy = async (text: string) => {
    await window.api.copy(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 1500)
  }

  const CopyRow = ({ label, value }: { label: string; value: string }) => (
    <div className="info-strip" style={{ alignItems: 'center', marginBottom: 8 }}>
      <div style={{ flex: 1 }}>
        <span>{label}:</span>
        <strong dir="ltr" style={{ userSelect: 'text' }}>
          {value}
        </strong>
      </div>
      <button className="btn" onClick={() => copy(value)}>
        {copied === value ? <Check size={14} /> : <Copy size={14} />} {copied === value ? t('support.copied') : t('support.copy')}
      </button>
    </div>
  )

  return (
    <Modal
      title={t('support.title')}
      icon={<Heart size={18} color="#e0433a" fill="#e0433a" />}
      onClose={closeDialog}
      footer={
        <button className="btn" onClick={closeDialog}>
          {t('support.later')}
        </button>
      }
    >
      <p style={{ marginTop: 0, lineHeight: 1.6 }}>{t('support.body')}</p>

      {SUPPORT.buyMeACoffee && (
        <button
          className="btn block bmc"
          style={{ height: 46, marginBottom: 10 }}
          onClick={() => window.api.openExternal(SUPPORT.buyMeACoffee)}
        >
          <Coffee size={18} /> {t('support.bmc')}
        </button>
      )}

      <div className="grid-2" style={{ gap: 10, marginBottom: 16 }}>
        {SUPPORT.kofi && (
          <button className="btn primary" style={{ height: 42 }} onClick={() => window.api.openExternal(SUPPORT.kofi)}>
            <Coffee size={17} /> {t('support.kofi')}
          </button>
        )}
        {SUPPORT.paypal && (
          <button className="btn" style={{ height: 42 }} onClick={() => window.api.openExternal(SUPPORT.paypal)}>
            <Heart size={16} /> PayPal
          </button>
        )}
      </div>

      {(SUPPORT.instapay || SUPPORT.vodafoneCash) && (
        <>
          <div className="field-label" style={{ marginBottom: 8 }}>
            {t('support.egypt')}
          </div>
          {SUPPORT.instapay && (
            <div className="instapay">
              <img src={instapayQr} alt="InstaPay QR" width={132} height={132} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <CopyRow label="InstaPay" value={SUPPORT.instapay} />
                {SUPPORT.instapayLink && (
                  <button className="btn block instapay-btn" onClick={() => window.api.openExternal(SUPPORT.instapayLink)}>
                    {t('support.instapayPay')}
                  </button>
                )}
                <div className="hint" style={{ marginTop: 6 }}>
                  {t('support.instapayScan')}
                </div>
              </div>
            </div>
          )}
          {SUPPORT.vodafoneCash && <CopyRow label="Vodafone Cash" value={SUPPORT.vodafoneCash} />}
        </>
      )}

      <div className="field-label" style={{ margin: '14px 0 8px' }}>
        {t('support.free')}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SUPPORT.github && (
          <button className="btn" onClick={() => window.api.openExternal(SUPPORT.github)}>
            <Github size={15} /> {t('support.star')}
          </button>
        )}
        {SUPPORT.website && (
          <button className="btn" onClick={() => copy(SUPPORT.website)}>
            {copied === SUPPORT.website ? <Check size={15} /> : <Share2 size={15} />}{' '}
            {copied === SUPPORT.website ? t('support.copied') : t('support.share')}
          </button>
        )}
      </div>

      <div className="field-label" style={{ margin: '18px 0 8px' }}>
        {t('support.follow')}
      </div>
      <SocialLinks />
    </Modal>
  )
}
