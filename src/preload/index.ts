import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api } from './api'

const on =
  (channel: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cb: (payload: any) => void): (() => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (_e: IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }

const api: Api = {
  getState: () => ipcRenderer.invoke('state:get'),
  probe: (req) => ipcRenderer.invoke('probe', req),
  cancelProbe: () => ipcRenderer.invoke('probe:cancel'),
  add: (reqs) => ipcRenderer.invoke('downloads:add', reqs),
  pause: (ids) => ipcRenderer.invoke('downloads:pause', ids),
  resume: (ids) => ipcRenderer.invoke('downloads:resume', ids),
  restart: (ids) => ipcRenderer.invoke('downloads:restart', ids),
  remove: (ids, deleteFiles) => ipcRenderer.invoke('downloads:remove', ids, deleteFiles),
  pauseAll: () => ipcRenderer.invoke('downloads:pauseAll'),
  resumeAll: () => ipcRenderer.invoke('downloads:resumeAll'),
  clearCompleted: () => ipcRenderer.invoke('downloads:clearCompleted'),
  refreshUrl: (id, url) => ipcRenderer.invoke('downloads:refreshUrl', id, url),
  open: (id) => ipcRenderer.invoke('downloads:open', id),
  openFolder: (id) => ipcRenderer.invoke('downloads:openFolder', id),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseDirectory: (current) => ipcRenderer.invoke('dialog:chooseDir', current),
  updateComponents: () => ipcRenderer.invoke('components:update'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  listBrowsers: () => ipcRenderer.invoke('browsers:list'),
  setupExtension: (id) => ipcRenderer.invoke('extension:setup', id),
  openExtensionsPage: (id) => ipcRenderer.invoke('extension:openPage', id),
  showExtensionFolder: (folder) => ipcRenderer.invoke('extension:showFolder', folder),
  extensionLastSeen: () => ipcRenderer.invoke('extension:lastSeen'),
  isIdmRunning: () => ipcRenderer.invoke('idm:running'),
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: on('update:state'),
  onDownloadsChanged: on('downloads:changed'),
  onDownloadsRemoved: on('downloads:removed'),
  onSettingsChanged: on('settings:changed'),
  onSupportPrompt: on('support:prompt'),
  onComponentsChanged: on('components:changed'),
  onExternalAdd: on('external:add'),
  onExternalBatch: on('external:batch')
}

contextBridge.exposeInMainWorld('api', api)
