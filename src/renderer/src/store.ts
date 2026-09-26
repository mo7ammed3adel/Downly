import { create } from 'zustand'
import type {
  AppState,
  ComponentsState,
  DownloadItem,
  ExternalAddRequest,
  Settings,
  SidebarFilter
} from '@shared/types'

export type Dialog =
  | { type: 'add'; initial?: ExternalAddRequest; urls?: string[] }
  | { type: 'settings'; tab?: string }
  | { type: 'scheduler' }
  | { type: 'support' }
  | { type: 'extension' }
  | { type: 'delete'; ids: string[] }
  | { type: 'refresh'; id: string }

interface Store {
  ready: boolean
  downloads: Record<string, DownloadItem>
  settings: Settings
  components: ComponentsState
  version: string
  platform: string
  windowsStore: boolean
  filter: SidebarFilter
  search: string
  selected: string[]
  dialog: Dialog | null
  /** Bumps on every openDialog so a dialog re-opened with new data starts fresh */
  dialogSeq: number
  init(state: AppState): void
  upsert(items: DownloadItem[]): void
  drop(ids: string[]): void
  set(patch: Partial<Store>): void
  select(ids: string[]): void
  openDialog(d: Dialog | null): void
}

export const useStore = create<Store>((set) => ({
  ready: false,
  downloads: {},
  settings: null as unknown as Settings,
  components: { ytdlp: { ready: false, busy: false }, ffmpeg: { ready: false } },
  version: '',
  platform: 'win32',
  windowsStore: false,
  filter: 'all',
  search: '',
  selected: [],
  dialog: null,
  dialogSeq: 0,
  init: (s) =>
    set({
      ready: true,
      downloads: Object.fromEntries(s.downloads.map((d) => [d.id, d])),
      settings: s.settings,
      components: s.components,
      version: s.version,
      platform: s.platform,
      windowsStore: s.windowsStore
    }),
  upsert: (items) =>
    set((st) => {
      const downloads = { ...st.downloads }
      for (const item of items) downloads[item.id] = item
      return { downloads }
    }),
  drop: (ids) =>
    set((st) => {
      const downloads = { ...st.downloads }
      for (const id of ids) delete downloads[id]
      return { downloads, selected: st.selected.filter((id) => !ids.includes(id)) }
    }),
  set: (patch) => set(patch),
  select: (ids) => set({ selected: ids }),
  openDialog: (dialog) => set((st) => ({ dialog, dialogSeq: st.dialogSeq + 1 }))
}))

export function matchesFilter(item: DownloadItem, filter: SidebarFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'active':
      return item.status === 'downloading' || item.status === 'processing' || item.status === 'queued'
    case 'unfinished':
      return item.status !== 'completed'
    case 'finished':
      return item.status === 'completed'
    default:
      return item.category === filter
  }
}
