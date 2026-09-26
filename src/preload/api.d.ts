import type {
  AppState,
  ComponentsState,
  DownloadItem,
  ExternalAddRequest,
  NewDownloadRequest,
  ProbeResult,
  Settings
} from '../shared/types'

type Unsubscribe = () => void

export interface Api {
  getState(): Promise<AppState>
  probe(req: { url: string; cookies?: string; referrer?: string; userAgent?: string }): Promise<ProbeResult>
  cancelProbe(): Promise<void>
  add(reqs: NewDownloadRequest[]): Promise<DownloadItem[]>
  pause(ids: string[]): Promise<void>
  resume(ids: string[]): Promise<void>
  restart(ids: string[]): Promise<void>
  remove(ids: string[], deleteFiles: boolean): Promise<void>
  pauseAll(): Promise<void>
  resumeAll(): Promise<void>
  clearCompleted(): Promise<void>
  refreshUrl(id: string, url: string): Promise<void>
  open(id: string): Promise<void>
  openFolder(id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  chooseDirectory(current?: string): Promise<string | null>
  updateComponents(): Promise<void>
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<string>
  copy(text: string): Promise<void>
  readClipboard(): Promise<string>
  onDownloadsChanged(cb: (items: DownloadItem[]) => void): Unsubscribe
  onDownloadsRemoved(cb: (ids: string[]) => void): Unsubscribe
  onSettingsChanged(cb: (s: Settings) => void): Unsubscribe
  onSupportPrompt(cb: () => void): Unsubscribe
  onComponentsChanged(cb: (c: ComponentsState) => void): Unsubscribe
  onExternalAdd(cb: (req: ExternalAddRequest) => void): Unsubscribe
  onExternalBatch(cb: (urls: string[]) => void): Unsubscribe
}

declare global {
  interface Window {
    api: Api
  }
}
