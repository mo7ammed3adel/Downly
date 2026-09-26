import { useEffect } from 'react'
import { useStore } from './store'
import { applyLanguage } from './i18n'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { DownloadTable } from './components/DownloadTable'
import { DetailsPanel } from './components/DetailsPanel'
import { StatusBar } from './components/StatusBar'
import { AddDialog } from './components/AddDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { SchedulerDialog } from './components/SchedulerDialog'
import { SupportDialog } from './components/SupportDialog'
import { ExtensionDialog } from './components/ExtensionDialog'
import { DeleteDialog, RefreshDialog } from './components/SmallDialogs'
import type { ThemeMode } from '@shared/types'

function useTheme(mode: ThemeMode | undefined): void {
  useEffect(() => {
    if (!mode) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const settings = useStore((s) => s.settings)
  const dialog = useStore((s) => s.dialog)
  const dialogSeq = useStore((s) => s.dialogSeq)

  useEffect(() => {
    const st = useStore.getState()
    void window.api.getState().then(st.init)
    const offs = [
      window.api.onDownloadsChanged((items) => useStore.getState().upsert(items)),
      window.api.onDownloadsRemoved((ids) => useStore.getState().drop(ids)),
      window.api.onSettingsChanged((settings) => useStore.getState().set({ settings })),
      window.api.onSupportPrompt(() => useStore.getState().openDialog({ type: 'support' })),
      window.api.onComponentsChanged((components) => useStore.getState().set({ components: { ...components } })),
      window.api.onExternalAdd((initial) => useStore.getState().openDialog({ type: 'add', initial })),
      window.api.onExternalBatch((urls) => useStore.getState().openDialog({ type: 'add', urls }))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useTheme(settings?.theme)

  // First launch: offer to connect the browser (skipped if the extension already talks to us)
  const onboarded = settings?.onboarding.extensionShown
  useEffect(() => {
    if (!ready || onboarded) return
    const timer = setTimeout(async () => {
      if ((await window.api.extensionLastSeen()) > 0) return
      if (!useStore.getState().dialog) useStore.getState().openDialog({ type: 'extension' })
    }, 1200)
    return () => clearTimeout(timer)
  }, [ready, onboarded])
  useEffect(() => {
    if (settings) applyLanguage(settings.language)
  }, [settings?.language])

  // Keyboard shortcuts + drag & drop of links, like IDM's drop target
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if (st.dialog || typing) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        st.openDialog({ type: 'add' })
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        void window.api.readClipboard().then((text) => st.openDialog({ type: 'add', initial: { url: text.trim() } }))
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        st.select(Object.keys(st.downloads))
      } else if (e.key === 'Delete' && st.selected.length) {
        st.openDialog({ type: 'delete', ids: st.selected })
      }
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
      if (text) useStore.getState().openDialog({ type: 'add', urls: text.split(/\s+/).filter(Boolean) })
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    window.addEventListener('keydown', onKey)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onOver)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onOver)
    }
  }, [])

  if (!ready) return null

  return (
    <div className="app">
      <Toolbar />
      <Sidebar />
      <main className="main">
        <DownloadTable />
        <DetailsPanel />
      </main>
      <StatusBar />
      {dialog?.type === 'add' && <AddDialog key={dialogSeq} initial={dialog.initial} urls={dialog.urls} />}
      {dialog?.type === 'settings' && <SettingsDialog initialTab={dialog.tab} />}
      {dialog?.type === 'scheduler' && <SchedulerDialog />}
      {dialog?.type === 'support' && <SupportDialog />}
      {dialog?.type === 'extension' && <ExtensionDialog />}
      {dialog?.type === 'delete' && <DeleteDialog ids={dialog.ids} />}
      {dialog?.type === 'refresh' && <RefreshDialog id={dialog.id} />}
    </div>
  )
}
