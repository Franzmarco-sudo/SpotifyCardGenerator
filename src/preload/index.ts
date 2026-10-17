import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type Api } from '@shared/ipc'
import type { NfcState } from '@shared/types'

const api: Api = {
  nfc: {
    getState: () => ipcRenderer.invoke(IPC.nfcGetState),
    refresh: () => ipcRenderer.invoke(IPC.nfcRefresh),
    onState: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, state: NfcState): void => cb(state)
      ipcRenderer.on(IPC.nfcState, listener)
      return () => ipcRenderer.removeListener(IPC.nfcState, listener)
    },
    read: (card) => ipcRenderer.invoke(IPC.nfcRead, card),
    write: (url, card) => ipcRenderer.invoke(IPC.nfcWrite, url, card),
    lock: (card) => ipcRenderer.invoke(IPC.nfcLock, card),
    format: (card) => ipcRenderer.invoke(IPC.nfcFormat, card)
  },
  settings: {
    load: () => ipcRenderer.invoke(IPC.settingsLoad),
    save: (patch) => ipcRenderer.invoke(IPC.settingsSave, patch)
  },
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  saveImage: (req) => ipcRenderer.invoke(IPC.saveImage, req)
}

contextBridge.exposeInMainWorld('api', api)
