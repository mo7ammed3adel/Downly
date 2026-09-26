import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Chrome, Copy, ExternalLink, FolderOpen, Puzzle } from 'lucide-react'
import type { BrowserId, BrowserInfo } from '@shared/types'
import { Modal, closeDialog } from './ui'

const BROWSER_COLORS: Record<BrowserId, string> = {
  chrome: '#1a73e8',
  edge: '#0c8fd8',
  brave: '#fb542b',
  opera: '#ff1b2d',
  vivaldi: '#ef3939',
  firefox: '#ff7139'
}

type Step = { kind: 'pick' } | { kind: 'guide'; browser: BrowserInfo; folder: string; oneClick: boolean }

/**
 * Walks the user through adding the Downly extension to a browser:
 * pick a browser → we open its extensions page and copy the folder path →
 * the dialog turns green by itself once the extension says hello to the app.
 */
export function ExtensionDialog() {
  const { t } = useTranslation()
  const [browsers, setBrowsers] = useState<BrowserInfo[] | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState(false)
  const openedAt = useRef(Date.now())

  useEffect(() => {
    void window.api.listBrowsers().then(setBrowsers)
    // Remember we offered this, so it doesn't pop up again on the next launch
    void window.api.updateSettings({ onboarding: { extensionShown: true } })
  }, [])

  // Watch for the extension's first ping after the dialog opened
  useEffect(() => {
    const timer = setInterval(async () => {
      if ((await window.api.extensionLastSeen()) > openedAt.current) setConnected(true)
    }, 1500)
    return () => clearInterval(timer)
  }, [])

  const choose = async (browser: BrowserInfo) => {
    const res = await window.api.setupExtension(browser.id)
    setStep({ kind: 'guide', browser, ...res })
  }

  const copyFolder = async (folder: string) => {
    await window.api.copy(folder)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal
      title={t('ext.title')}
      icon={<Puzzle size={18} />}
      onClose={closeDialog}
      footer={
        <>
          {step.kind === 'guide' && !connected && (
            <button className="btn" onClick={() => setStep({ kind: 'pick' })}>
              {t('ext.otherBrowser')}
            </button>
          )}
          <button className={`btn ${connected ? 'primary' : ''}`} onClick={closeDialog}>
            {connected ? t('ext.done') : t('ext.later')}
          </button>
        </>
      }
    >
      {connected && (
        <div className="note success">
          <Check size={18} /> <strong>{t('ext.connected')}</strong>
        </div>
      )}

      {step.kind === 'pick' && (
        <>
          <p className="hint" style={{ marginTop: 0, fontSize: 13.5 }}>
            {t('ext.intro')}
          </p>
          {browsers === null ? (
            <div className="center-state">
              <div className="spinner" />
            </div>
          ) : browsers.length === 0 ? (
            <div className="note warn">{t('ext.noBrowsers')}</div>
          ) : (
            <div className="browser-grid">
              {browsers.map((b) => (
                <button key={b.id} className="browser-card" onClick={() => choose(b)}>
                  <span className="browser-dot" style={{ background: BROWSER_COLORS[b.id] }}>
                    <Chrome size={20} />
                  </span>
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step.kind === 'guide' && step.browser.kind === 'chromium' && (
        <ol className="steps">
          <li>
            <strong>{t('ext.step1', { browser: step.browser.name })}</strong>
            <button className="btn ghost" onClick={() => window.api.openExtensionsPage(step.browser.id)}>
              <ExternalLink size={14} /> {t('ext.openAgain')}
            </button>
          </li>
          <li>
            <strong>{t('ext.step2')}</strong>
            <span className="hint">{t('ext.step2Hint')}</span>
          </li>
          <li>
            <strong>{t('ext.step3')}</strong>
            <span className="hint">{t('ext.step3Hint')}</span>
            <div className="path-box">
              <code dir="ltr">{step.folder}</code>
              <button className="btn" onClick={() => copyFolder(step.folder)}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('support.copied') : t('support.copy')}
              </button>
              <button className="btn" onClick={() => window.api.showExtensionFolder(step.folder)}>
                <FolderOpen size={14} />
              </button>
            </div>
          </li>
        </ol>
      )}

      {step.kind === 'guide' && step.browser.kind === 'firefox' && (
        <ol className="steps">
          {step.oneClick ? (
            <li>
              <strong>{t('ext.firefoxAdd')}</strong>
            </li>
          ) : (
            <>
              <li>
                <strong>{t('ext.firefoxTemp1')}</strong>
              </li>
              <li>
                <strong>{t('ext.firefoxTemp2')}</strong>
                <div className="path-box">
                  <code dir="ltr">{step.folder}</code>
                  <button className="btn" onClick={() => window.api.showExtensionFolder(step.folder)}>
                    <FolderOpen size={14} />
                  </button>
                </div>
                <span className="hint">{t('ext.firefoxTempNote')}</span>
              </li>
            </>
          )}
        </ol>
      )}

      {step.kind === 'guide' && !connected && (
        <div className="waiting">
          <div className="spinner" /> {t('ext.waiting')}
        </div>
      )}
    </Modal>
  )
}
