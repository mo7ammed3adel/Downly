import type {
  AppState,
  BrowserId,
  BrowserInfo,
  ComponentsState,
  DownloadItem,
  ExtensionSetup,
  ExternalAddRequest,
  NewDownloadRequest,
  ProbeRequest,
  ProbeResult,
  Settings,
  SettingsPatch,
  Subscription,
  UpdateState
} from '../shared/types'

type Unsubscribe = () => void

export interface Api {
  getState(): Promise<AppState>
  probe(req: ProbeRequest): Promise<ProbeResult>
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
  updateSettings(patch: SettingsPatch): Promise<Settings>
  chooseDirectory(current?: string): Promise<string | null>
  updateComponents(): Promise<void>
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<string>
  copy(text: string): Promise<void>
  readClipboard(): Promise<string>
  listBrowsers(): Promise<BrowserInfo[]>
  /** Opens the browser (in that profile) where the extension gets added */
  setupExtension(id: BrowserId, profileDir?: string): Promise<ExtensionSetup>
  showExtensionFolder(folder: string): Promise<void>
  /** ms timestamp of the extension's last contact with the app, 0 if never */
  extensionLastSeen(): Promise<number>
  /** Internet Download Manager is running (it grabs browser downloads first) */
  isIdmRunning(): Promise<boolean>
  /** Saves a problem report on the desktop and opens the WhatsApp chat; returns the file path */
  createReport(note: string): Promise<string>
  listSubscriptions(): Promise<Subscription[]>
  /** Follows a channel/playlist: what's there now is remembered, only new videos download */
  addSubscription(url: string, mode: 'video' | 'audio'): Promise<Subscription>
  removeSubscription(id: string): Promise<void>
  checkSubscriptions(): Promise<void>
  onSubscriptionsChanged(cb: (subs: Subscription[]) => void): Unsubscribe
  getUpdateState(): Promise<UpdateState>
  checkForUpdate(): Promise<UpdateState>
  /** Windows: download + install (the app restarts); elsewhere opens the download page */
  installUpdate(): Promise<void>
  onUpdateState(cb: (s: UpdateState) => void): Unsubscribe
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
