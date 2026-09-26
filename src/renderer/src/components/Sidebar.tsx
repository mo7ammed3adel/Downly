import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, CircleDashed, Download, Heart, Layers } from 'lucide-react'
import type { Category, SidebarFilter } from '@shared/types'
import { matchesFilter, useStore } from '../store'
import { CategoryIcon } from './ui'

const CATEGORIES: Category[] = ['video', 'music', 'documents', 'compressed', 'programs', 'images', 'other']

export function Sidebar() {
  const { t } = useTranslation()
  const filter = useStore((s) => s.filter)
  const downloads = useStore((s) => s.downloads)

  const counts = useMemo(() => {
    const list = Object.values(downloads)
    const c: Partial<Record<SidebarFilter, number>> = {}
    for (const f of ['all', 'active', 'unfinished', 'finished', ...CATEGORIES] as SidebarFilter[]) {
      c[f] = list.filter((i) => matchesFilter(i, f)).length
    }
    return c
  }, [downloads])

  const Item = ({ id, icon }: { id: SidebarFilter; icon: React.ReactNode }) => (
    <button className={`nav-item ${filter === id ? 'active' : ''}`} onClick={() => useStore.getState().set({ filter: id, selected: [] })}>
      {icon}
      <span className="label">{t(`sidebar.${id}`)}</span>
      <span className="count">{counts[id] || ''}</span>
    </button>
  )

  return (
    <nav className="sidebar">
      <Item id="all" icon={<Layers size={17} />} />
      <Item id="active" icon={<Download size={17} />} />
      <Item id="unfinished" icon={<CircleDashed size={17} />} />
      <Item id="finished" icon={<CheckCircle2 size={17} />} />
      <h4>{t('sidebar.categories')}</h4>
      {CATEGORIES.map((c) => (
        <Item key={c} id={c} icon={<CategoryIcon category={c} size={17} />} />
      ))}
      <div className="upgrade-card">
        <strong>
          <Heart size={14} style={{ verticalAlign: -2, color: '#e0433a' }} fill="#e0433a" /> {t('support.cardTitle')}
        </strong>
        <p>{t('support.cardBody')}</p>
        <button className="btn primary block" onClick={() => useStore.getState().openDialog({ type: 'support' })}>
          {t('toolbar.support')}
        </button>
      </div>
    </nav>
  )
}
