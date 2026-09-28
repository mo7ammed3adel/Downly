import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, FolderOpen, Puzzle, UserRound } from 'lucide-react'
import type { BrowserInfo, BrowserProfile, ExtensionSetup } from '@shared/types'
import { useStore } from '../store'
import { AddressBarShot, BROWSER_LOGOS, ExtensionsPageShot, FilePickerShot, FirefoxAddShot, FirefoxDebuggingShot } from './BrowserShots'
import { Modal, closeDialog } from './ui'

type Step =
  | { kind: 'pick' }
  | { kind: 'profile'; browser: BrowserInfo }
  | { kind: 'guide'; browser: BrowserInfo; setup: ExtensionSetup }

/** A value with a Copy button (the extensions address, the extension folder) */
function CopyField(props: { value: string; onOpenFolder?: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await window.api.copy(props.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="path-box">
      <code dir="ltr">{props.value}</code>
      <button className="btn" onClick={copy}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('support.copied') : t('support.copy')}
      </button>
      {props.onOpenFolder && (
        <button className="btn" onClick={props.onOpenFolder}>
          <FolderOpen size={14} />
        </button>
      )}
    </div>
  )
}

/**
 * Walks the user through adding the Downly extension to a browser:
 * pick a browser (and profile) → it opens there → from its store page, or by pasting the
 * extensions address (browsers don't let other programs open it) and loading the folder →
 * the dialog turns green by itself once the extension says hello to the app.
 */
export function ExtensionDialog() {
  const { t } = useTranslation()
  const platform = useStore((s) => s.platform)
  const [browsers, setBrowsers] = useState<BrowserInfo[] | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [connected, setConnected] = useState(false)
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

  const start = async (browser: BrowserInfo, profile?: BrowserProfile) => {
    const setup = await window.api.setupExtension(browser.id, profile?.dir)
    setStep({ kind: 'guide', browser, setup })
  }
  // Several profiles: the extension belongs to one of them, so ask which
  const choose = (browser: BrowserInfo) => (browser.profiles.length > 1 ? setStep({ kind: 'profile', browser }) : start(browser, browser.profiles[0]))

  return (
    <Modal
      title={t('ext.title')}
      icon={<Puzzle size={18} />}
      wide={step.kind === 'guide'}
      onClose={closeDialog}
      footer={
        <>
          {step.kind !== 'pick' && !connected && (
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
                  <img className="browser-logo" src={BROWSER_LOGOS[b.id]} alt="" />
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step.kind === 'profile' && (
        <>
          <p className="hint" style={{ marginTop: 0, fontSize: 13.5 }}>
            {t('ext.profileTitle', { browser: step.browser.name })}
          </p>
          <div className="browser-grid">
            {step.browser.profiles.map((p) => (
              <button key={p.dir} className="browser-card" onClick={() => start(step.browser, p)}>
                <UserRound size={22} />
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      {step.kind === 'guide' && step.browser.kind === 'chromium' && step.setup.store && (
        <ol className="steps">
          <li>
            <strong>{t('ext.storeAdd', { browser: step.browser.name })}</strong>
          </li>
        </ol>
      )}

      {step.kind === 'guide' && step.browser.kind === 'chromium' && !step.setup.store && (
        <ol className="steps">
          <li>
            <strong>{t('ext.step1', { browser: step.browser.name })}</strong>
            <span className="hint">{t('ext.step1Hint')}</span>
            <CopyField value={step.browser.extensionsUrl} />
            <AddressBarShot browser={step.browser.id} url={step.browser.extensionsUrl} />
          </li>
          <li>
            <strong>{t('ext.step2')}</strong>
            <span className="hint">{t(step.browser.id === 'edge' ? 'ext.step2HintEdge' : 'ext.step2Hint')}</span>
            <ExtensionsPageShot browser={step.browser.id} devMode={false} />
          </li>
          <li>
            <strong>{t('ext.step3')}</strong>
            <ExtensionsPageShot browser={step.browser.id} devMode />
          </li>
          <li>
            <strong>{t('ext.step4')}</strong>
            <span className="hint">{t(platform === 'darwin' ? 'ext.step4HintMac' : platform === 'linux' ? 'ext.step4HintLinux' : 'ext.step4Hint')}</span>
            <CopyField value={step.setup.folder} onOpenFolder={() => window.api.showExtensionFolder(step.setup.folder)} />
            <FilePickerShot platform={platform} />
          </li>
        </ol>
      )}

      {step.kind === 'guide' && step.browser.kind === 'firefox' && (
        <ol className="steps">
          {step.setup.oneClick ? (
            <li>
              <strong>{t('ext.firefoxAdd')}</strong>
              <FirefoxAddShot />
            </li>
          ) : (
            <>
              <li>
                <strong>{t('ext.firefoxTemp1')}</strong>
                <FirefoxDebuggingShot />
              </li>
              <li>
                <strong>{t('ext.firefoxTemp2')}</strong>
                <CopyField value={step.setup.folder} onOpenFolder={() => window.api.showExtensionFolder(step.setup.folder)} />
                <FilePickerShot platform={platform} file="manifest.json" />
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
