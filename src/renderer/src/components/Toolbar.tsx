import { useTranslation } from 'react-i18next'
import { CalendarClock, Heart, Moon, Pause, Play, Plus, Rss, Search, Settings, Sun, Trash2, ListChecks, CircleStop } from 'lucide-react'
import { useStore } from '../store'
import logo from '../assets/logo.png'

export function Toolbar() {
  const { t } = useTranslation()
  const selected = useStore((s) => s.selected)
  const downloads = useStore((s) => s.downloads)
  const search = useStore((s) => s.search)
  const settings = useStore((s) => s.settings)
  const { openDialog, set } = useStore.getState()

  const items = selected.map((id) => downloads[id]).filter(Boolean)
  const canResume = items.some((i) => i.status === 'paused' || i.status === 'error')
  const canPause = items.some((i) => i.status === 'downloading' || i.status === 'queued' || i.status === 'processing')
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <header className="toolbar">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="" width={28} height={28} />
        <span>{t('app.name')}</span>
      </div>
      <button className="btn primary" onClick={() => openDialog({ type: 'add' })} title="Ctrl+N">
        <Plus size={16} />
        <span className="label">{t('toolbar.add')}</span>
      </button>
      <div className="sep" />
      <button className="btn ghost" disabled={!canResume} onClick={() => window.api.resume(selected)}>
        <Play size={16} />
        <span className="label">{t('toolbar.resume')}</span>
      </button>
      <button className="btn ghost" disabled={!canPause} onClick={() => window.api.pause(selected)}>
        <Pause size={16} />
        <span className="label">{t('toolbar.pause')}</span>
      </button>
      <button className="btn ghost" disabled={!items.length} onClick={() => openDialog({ type: 'delete', ids: selected })}>
        <Trash2 size={16} />
        <span className="label">{t('toolbar.delete')}</span>
      </button>
      <div className="sep" />
      <button className="btn ghost" onClick={() => window.api.resumeAll()} title={t('toolbar.resumeAll')}>
        <ListChecks size={16} />
        <span className="label">{t('toolbar.resumeAll')}</span>
      </button>
      <button className="btn ghost" onClick={() => window.api.pauseAll()} title={t('toolbar.pauseAll')}>
        <CircleStop size={16} />
        <span className="label">{t('toolbar.pauseAll')}</span>
      </button>
      <button className="btn ghost icon" title={t('subs.title')} onClick={() => openDialog({ type: 'subscriptions' })}>
        <Rss size={16} />
      </button>
      <button className="btn ghost" onClick={() => openDialog({ type: 'scheduler' })}>
        <CalendarClock size={16} />
        <span className="label">{t('toolbar.scheduler')}</span>
      </button>
      <div className="spacer" />
      <label className="search">
        <Search size={15} />
        <input value={search} placeholder={t('toolbar.search')} onChange={(e) => set({ search: e.target.value })} />
      </label>
      <button
        className="btn ghost icon"
        title={t('toolbar.theme')}
        onClick={() => window.api.updateSettings({ theme: dark ? 'light' : 'dark' })}
      >
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <button className="btn ghost icon" title={t('toolbar.settings')} onClick={() => openDialog({ type: 'settings' })}>
        <Settings size={17} />
      </button>
      <button className="btn support" onClick={() => openDialog({ type: 'support' })}>
        <Heart size={15} />
        <span className="label">{t('toolbar.support')}</span>
      </button>
    </header>
  )
}
