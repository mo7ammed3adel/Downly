import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Chrome, Download, FolderOpen, Globe, Info, RefreshCw, Settings as Cog, Video } from 'lucide-react'
import type { Settings } from '@shared/types'
import { SUPPORTED_LANGUAGES } from '@shared/i18n'
import { useStore } from '../store'
import { Field, Modal, Toggle, closeDialog } from './ui'
import logo from '../assets/logo.png'

type Tab = 'general' | 'downloads' | 'connection' | 'browser' | 'media' | 'about'

const TABS: { id: Tab; icon: React.ReactNode }[] = [
  { id: 'general', icon: <Cog size={16} /> },
  { id: 'downloads', icon: <Download size={16} /> },
  { id: 'connection', icon: <Globe size={16} /> },
  { id: 'browser', icon: <Chrome size={16} /> },
  { id: 'media', icon: <Video size={16} /> },
  { id: 'about', icon: <Info size={16} /> }
]

const BROWSERS = ['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'chromium'] as const

export function SettingsDialog({ initialTab }: { initialTab?: string }) {
  const { t } = useTranslation()
  const saved = useStore((s) => s.settings)
  const components = useStore((s) => s.components)
  const version = useStore((s) => s.version)
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'general')
  const [s, setS] = useState<Settings>(saved)
  const patch = <K extends keyof Settings>(key: K, value: Settings[K]) => setS((prev) => ({ ...prev, [key]: value }))
  const sub = <K extends 'proxy' | 'browserIntegration' | 'media' | 'spotify'>(key: K, value: Partial<Settings[K]>) =>
    setS((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }))
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min))

  const save = async () => {
    await window.api.updateSettings(s)
    closeDialog()
  }

  return (
    <Modal
      title={t('settings.title')}
      icon={<Cog size={18} />}
      onClose={closeDialog}
      wide
      bodyClass="settings"
      footer={
        <>
          <button className="btn" onClick={closeDialog}>
            {t('add.cancel')}
          </button>
          <button className="btn primary" onClick={save}>
            {t('settings.save')}
          </button>
        </>
      }
    >
      <nav className="settings-nav">
        {TABS.map((x) => (
          <button key={x.id} className={`nav-item ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
            {x.icon} {t(`settings.tabs.${x.id}`)}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {tab === 'general' && (
          <>
            <div className="grid-2">
              <Field label={t('settings.language')}>
                <select className="select" value={s.language} onChange={(e) => patch('language', e.target.value)}>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('settings.theme')}>
                <select className="select" value={s.theme} onChange={(e) => patch('theme', e.target.value as Settings['theme'])}>
                  <option value="system">{t('settings.themeSystem')}</option>
                  <option value="light">{t('settings.themeLight')}</option>
                  <option value="dark">{t('settings.themeDark')}</option>
                </select>
              </Field>
            </div>
            <Toggle label={t('settings.startWithSystem')} checked={s.startWithSystem} onChange={(v) => patch('startWithSystem', v)} />
            <Toggle label={t('settings.minimizeToTray')} checked={s.minimizeToTray} onChange={(v) => patch('minimizeToTray', v)} />
            <Toggle label={t('settings.notifications')} checked={s.notifications} onChange={(v) => patch('notifications', v)} />
            <Toggle label={t('settings.clipboard')} checked={s.clipboardMonitor} onChange={(v) => patch('clipboardMonitor', v)} />
          </>
        )}

        {tab === 'downloads' && (
          <>
            <Field label={t('settings.downloadDir')}>
              <div className="input-row">
                <input className="input" value={s.downloadDir} onChange={(e) => patch('downloadDir', e.target.value)} />
                <button
                  className="btn"
                  onClick={async () => {
                    const dir = await window.api.chooseDirectory(s.downloadDir)
                    if (dir) patch('downloadDir', dir)
                  }}
                >
                  <FolderOpen size={15} /> {t('add.browse')}
                </button>
              </div>
            </Field>
            <Toggle label={t('settings.categoryFolders')} checked={s.useCategoryFolders} onChange={(v) => patch('useCategoryFolders', v)} />
            <div className="grid-2" style={{ marginTop: 10 }}>
              <Field label={t('settings.onFileExists')}>
                <select className="select" value={s.onFileExists} onChange={(e) => patch('onFileExists', e.target.value as Settings['onFileExists'])}>
                  <option value="rename">{t('settings.rename')}</option>
                  <option value="overwrite">{t('settings.overwrite')}</option>
                </select>
              </Field>
              <Field label={t('settings.maxConcurrent')}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={16}
                  value={s.maxConcurrent}
                  onChange={(e) => patch('maxConcurrent', num(e.target.value, 1, 16))}
                />
              </Field>
              <Field
                label={t('settings.connections')}
              >
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={32}
                  value={s.connectionsPerDownload}
                  onChange={(e) => patch('connectionsPerDownload', num(e.target.value, 1, 32))}
                />
              </Field>
              <Field label={t('settings.retries')}>
                <input className="input" type="number" min={0} max={100} value={s.maxRetries} onChange={(e) => patch('maxRetries', num(e.target.value, 0, 100))} />
              </Field>
            </div>
            <div className="section">
              <Toggle label={t('settings.speedLimit')} checked={s.speedLimitEnabled} onChange={(v) => patch('speedLimitEnabled', v)} />
              {s.speedLimitEnabled && (
                <Field label={t('settings.speedLimitValue')}>
                  <input
                    className="input"
                    type="number"
                    min={10}
                    value={s.speedLimitKBps}
                    onChange={(e) => patch('speedLimitKBps', num(e.target.value, 10, 10_000_000))}
                  />
                </Field>
              )}
            </div>
          </>
        )}

        {tab === 'connection' && (
          <>
            <Field label={t('settings.proxy')}>
              <select className="select" value={s.proxy.mode} onChange={(e) => sub('proxy', { mode: e.target.value as Settings['proxy']['mode'] })}>
                <option value="none">{t('settings.proxyNone')}</option>
                <option value="system">{t('settings.proxySystem')}</option>
                <option value="manual">{t('settings.proxyManual')}</option>
              </select>
            </Field>
            {s.proxy.mode === 'manual' && (
              <Field label={t('settings.proxyUrl')}>
                <input className="input" value={s.proxy.url} placeholder="http://127.0.0.1:8080" onChange={(e) => sub('proxy', { url: e.target.value })} />
              </Field>
            )}
            <Field label={t('settings.timeout')}>
              <input className="input" type="number" min={5} max={600} value={s.timeoutSec} onChange={(e) => patch('timeoutSec', num(e.target.value, 5, 600))} />
            </Field>
            <Field label={t('settings.userAgent')}>
              <input className="input" value={s.userAgent} onChange={(e) => patch('userAgent', e.target.value)} />
            </Field>
          </>
        )}

        {tab === 'browser' && (
          <>
            <div className="note">
              <Chrome size={16} style={{ flex: 'none' }} />
              <div>
                <strong>{t('settings.installExtension')}</strong>
                <div>{t('settings.extensionHint')}</div>
              </div>
            </div>
            <Toggle
              label={t('settings.browserEnabled')}
              checked={s.browserIntegration.enabled}
              onChange={(v) => sub('browserIntegration', { enabled: v })}
            />
            <Toggle label={t('settings.confirmBrowser')} checked={s.confirmBrowserDownloads} onChange={(v) => patch('confirmBrowserDownloads', v)} />
            <Field label={t('settings.interceptTypes')}>
              <textarea
                className="textarea"
                value={s.browserIntegration.interceptExtensions.join(' ')}
                onChange={(e) =>
                  sub('browserIntegration', {
                    interceptExtensions: e.target.value
                      .toLowerCase()
                      .split(/[\s,;]+/)
                      .map((x) => x.replace(/^\./, ''))
                      .filter(Boolean)
                  })
                }
              />
            </Field>
            <Field label={t('settings.skipDomains')}>
              <input
                className="input"
                value={s.browserIntegration.skipDomains.join(', ')}
                placeholder="example.com, drive.google.com"
                onChange={(e) =>
                  sub('browserIntegration', {
                    skipDomains: e.target.value
                      .split(/[\s,;]+/)
                      .map((x) => x.trim())
                      .filter(Boolean)
                  })
                }
              />
            </Field>
            <div className="grid-2">
              <Field label={t('settings.minSize')}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={s.browserIntegration.minSizeKB}
                  onChange={(e) => sub('browserIntegration', { minSizeKB: num(e.target.value, 0, 10_000_000) })}
                />
              </Field>
              <Field label={t('settings.port')}>
                <input
                  className="input"
                  type="number"
                  min={1024}
                  max={65535}
                  value={s.browserIntegration.port}
                  onChange={(e) => sub('browserIntegration', { port: num(e.target.value, 1024, 65535) })}
                />
              </Field>
            </div>
          </>
        )}

        {tab === 'media' && (
          <>
            <div className="grid-2">
              <Field label={t('settings.defaultMode')}>
                <select className="select" value={s.media.defaultMode} onChange={(e) => sub('media', { defaultMode: e.target.value as 'video' | 'audio' })}>
                  <option value="video">{t('add.video')}</option>
                  <option value="audio">{t('add.audio')}</option>
                </select>
              </Field>
              <Field label={t('settings.defaultQuality')}>
                <select className="select" value={s.media.defaultQuality} onChange={(e) => sub('media', { defaultQuality: Number(e.target.value) })}>
                  <option value={0}>{t('add.best')}</option>
                  {[2160, 1440, 1080, 720, 480, 360].map((h) => (
                    <option key={h} value={h}>
                      {h}p
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('settings.defaultContainer')}>
                <select className="select" value={s.media.defaultContainer} onChange={(e) => sub('media', { defaultContainer: e.target.value as Settings['media']['defaultContainer'] })}>
                  {['mp4', 'mkv', 'webm'].map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('settings.defaultAudio')}>
                <select className="select" value={s.media.defaultAudioFormat} onChange={(e) => sub('media', { defaultAudioFormat: e.target.value as Settings['media']['defaultAudioFormat'] })}>
                  {['mp3', 'm4a', 'opus', 'flac', 'wav', 'best'].map((c) => (
                    <option key={c} value={c}>
                      {c === 'best' ? t('add.best') : c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('settings.fragments')}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={16}
                  value={s.media.concurrentFragments}
                  onChange={(e) => sub('media', { concurrentFragments: num(e.target.value, 1, 16) })}
                />
              </Field>
              <Field label={t('settings.cookiesFrom')}>
                <select className="select" value={s.media.cookiesFromBrowser} onChange={(e) => sub('media', { cookiesFromBrowser: e.target.value as Settings['media']['cookiesFromBrowser'] })}>
                  <option value="">{t('settings.cookiesNone')}</option>
                  {BROWSERS.map((b) => (
                    <option key={b} value={b}>
                      {b[0].toUpperCase() + b.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Toggle label={t('settings.embedMetadata')} checked={s.media.embedMetadata} onChange={(v) => sub('media', { embedMetadata: v })} />
            <Toggle label={t('settings.embedThumbnail')} checked={s.media.embedThumbnail} onChange={(v) => sub('media', { embedThumbnail: v })} />
            <div className="section" style={{ marginTop: 14 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>
                {t('settings.spotify')}
              </div>
              <div className="grid-2">
                <Field label={t('settings.spotifyId')}>
                  <input className="input" value={s.spotify.clientId} onChange={(e) => sub('spotify', { clientId: e.target.value.trim() })} />
                </Field>
                <Field label={t('settings.spotifySecret')}>
                  <input className="input" type="password" value={s.spotify.clientSecret} onChange={(e) => sub('spotify', { clientSecret: e.target.value.trim() })} />
                </Field>
              </div>
            </div>
            <div className="info-strip" style={{ alignItems: 'center' }}>
              <div>
                <span>{t('settings.engine')}:</span>
                yt-dlp {components.ytdlp.version ?? '—'} · ffmpeg {components.ffmpeg.ready ? '✓' : '✗'}
              </div>
              <button className="btn" disabled={components.ytdlp.busy} onClick={() => window.api.updateComponents()}>
                <RefreshCw size={14} className={components.ytdlp.busy ? 'spin' : ''} /> {t('settings.updateEngine')}
              </button>
            </div>
          </>
        )}

        {tab === 'about' && (
          <div className="empty" style={{ minHeight: 260 }}>
            <img src={logo} alt="" width={84} height={84} />
            <h3>Downly</h3>
            <div>{t('app.tagline')}</div>
            <div className="hint">
              {t('settings.version')} {version} · yt-dlp {components.ytdlp.version ?? '—'}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
