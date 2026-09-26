import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Download, ExternalLink, FolderOpen, Link2, Pause, Play, RotateCcw, Trash2, FileX } from 'lucide-react'
import type { DownloadItem } from '@shared/types'
import { formatBytes, formatDuration } from '@shared/util'
import { matchesFilter, useStore } from '../store'
import { FileIcon } from './ui'

export function DownloadTable() {
  const { t, i18n } = useTranslation()
  const downloads = useStore((s) => s.downloads)
  const filter = useStore((s) => s.filter)
  const search = useStore((s) => s.search)
  const selected = useStore((s) => s.selected)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const anchor = useRef<string | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.values(downloads)
      .filter((d) => matchesFilter(d, filter))
      .filter((d) => !q || d.fileName.toLowerCase().includes(q) || d.url.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [downloads, filter, search])

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    [i18n.language]
  )

  const onRowClick = (e: React.MouseEvent, id: string) => {
    const { select } = useStore.getState()
    if (e.shiftKey && anchor.current) {
      const ids = rows.map((r) => r.id)
      const [a, b] = [ids.indexOf(anchor.current), ids.indexOf(id)].sort((x, y) => x - y)
      select(ids.slice(a, b + 1))
    } else if (e.ctrlKey || e.metaKey) {
      select(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
      anchor.current = id
    } else {
      select([id])
      anchor.current = id
    }
  }

  const onDoubleClick = (item: DownloadItem) => {
    if (item.status === 'completed') void window.api.open(item.id)
    else if (item.status === 'paused' || item.status === 'error') void window.api.resume([item.id])
  }

  if (!rows.length) {
    return (
      <div className="table">
        <div className="empty">
          <div className="circle">
            <Download size={30} />
          </div>
          <h3>{t('table.empty')}</h3>
          <div>{t('table.emptyHint')}</div>
          <button className="btn primary" style={{ marginTop: 8 }} onClick={() => useStore.getState().openDialog({ type: 'add' })}>
            {t('toolbar.add')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="table" onClick={(e) => e.target === e.currentTarget && useStore.getState().select([])}>
      <div className="row head">
        <div>{t('table.name')}</div>
        <div>{t('table.size')}</div>
        <div>{t('table.status')}</div>
        <div>{t('table.speed')}</div>
        <div>{t('table.eta')}</div>
        <div>{t('table.added')}</div>
      </div>
      {rows.map((item) => (
        <div
          key={item.id}
          className={`row ${selected.includes(item.id) ? 'selected' : ''}`}
          onClick={(e) => onRowClick(e, item.id)}
          onDoubleClick={() => onDoubleClick(item)}
          onContextMenu={(e) => {
            e.preventDefault()
            if (!selected.includes(item.id)) useStore.getState().select([item.id])
            setMenu({ x: e.clientX, y: e.clientY })
          }}
        >
          <div className="cell-name">
            <FileIcon category={item.category} />
            <div className="name-text">
              <div className="title" title={item.fileName}>
                {item.fileName}
              </div>
              <div className="sub">{item.playlistTitle ?? hostOf(item.pageUrl ?? item.url)}</div>
            </div>
          </div>
          <div className="num">{item.size > 0 ? formatBytes(item.size) : '—'}</div>
          <StatusCell item={item} />
          <div className="num">{item.status === 'downloading' && item.speed > 0 ? `${formatBytes(item.speed)}/s` : ''}</div>
          <div className="num">{item.status === 'downloading' && item.eta >= 0 ? formatDuration(item.eta) : ''}</div>
          <div className="num">{dateFmt.format(item.createdAt)}</div>
        </div>
      ))}
      {menu && <RowMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function StatusCell({ item }: { item: DownloadItem }) {
  const { t } = useTranslation()
  const pct = item.size > 0 ? Math.min(100, (item.downloaded / item.size) * 100) : 0
  if (item.status === 'completed') {
    return (
      <div>
        <span className="badge completed">{t('status.completed')}</span>
      </div>
    )
  }
  if (item.status === 'error') {
    return (
      <div title={item.error}>
        <span className="badge error">{t('status.error')}</span>
      </div>
    )
  }
  const indeterminate = (item.status === 'downloading' && item.size <= 0) || item.stage
  const label = item.stage
    ? t(`status.stage.${item.stage}`, { defaultValue: t('status.processing') })
    : t(`status.${item.status}`)
  return (
    <div className="progress">
      <div className="label">
        <span>{label}</span>
        <span>{item.size > 0 && !item.stage ? `${pct.toFixed(1)}%` : item.downloaded > 0 ? formatBytes(item.downloaded) : ''}</span>
      </div>
      <div className={`bar ${item.status} ${indeterminate ? 'indeterminate' : ''}`}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function RowMenu({ x, y, onClose }: { x: number; y: number; onClose(): void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const selected = useStore((s) => s.selected)
  const downloads = useStore((s) => s.downloads)
  const items = selected.map((id) => downloads[id]).filter(Boolean)
  const one = items.length === 1 ? items[0] : null
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    // Keep the menu inside the window
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) })
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [])

  const act = (fn: () => unknown) => () => {
    void fn()
    onClose()
  }
  const ids = items.map((i) => i.id)
  const { openDialog } = useStore.getState()

  return (
    <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }}>
      <button disabled={one?.status !== 'completed'} onClick={act(() => one && window.api.open(one.id))}>
        <ExternalLink size={15} /> {t('context.open')}
      </button>
      <button disabled={!one} onClick={act(() => one && window.api.openFolder(one.id))}>
        <FolderOpen size={15} /> {t('context.openFolder')}
      </button>
      <hr />
      <button disabled={!items.some((i) => i.status === 'paused' || i.status === 'error')} onClick={act(() => window.api.resume(ids))}>
        <Play size={15} /> {t('context.resume')}
      </button>
      <button
        disabled={!items.some((i) => ['downloading', 'queued', 'processing'].includes(i.status))}
        onClick={act(() => window.api.pause(ids))}
      >
        <Pause size={15} /> {t('context.pause')}
      </button>
      <button onClick={act(() => window.api.restart(ids))}>
        <RotateCcw size={15} /> {t('context.restart')}
      </button>
      <hr />
      <button disabled={!one} onClick={act(() => one && window.api.copy(one.pageUrl ?? one.url))}>
        <Copy size={15} /> {t('context.copyLink')}
      </button>
      <button
        disabled={!one || one.kind !== 'http' || one.status === 'completed'}
        onClick={act(() => one && openDialog({ type: 'refresh', id: one.id }))}
      >
        <Link2 size={15} /> {t('context.refresh')}
      </button>
      <hr />
      <button className="danger" onClick={act(() => window.api.remove(ids, false))}>
        <Trash2 size={15} /> {t('context.delete')}
      </button>
      <button className="danger" onClick={act(() => window.api.remove(ids, true))}>
        <FileX size={15} /> {t('context.deleteWithFile')}
      </button>
    </div>
  )
}
