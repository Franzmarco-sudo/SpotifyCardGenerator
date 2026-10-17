import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { IPC, type SaveImageRequest } from '@shared/ipc'
import type { CardType, NfcResult } from '@shared/types'
import type { NfcManager } from './nfc/nfcManager'
import type { SettingsStore } from './settings/settingsStore'

const isCardType = (v: unknown): v is CardType => v === 'ntag215' || v === 'mifare1k'
const bad = (message: string): NfcResult => ({ ok: false, message })

export function registerIpc(nfc: NfcManager, settings: SettingsStore): void {
  ipcMain.handle(IPC.nfcGetState, () => nfc.getState())
  ipcMain.handle(IPC.nfcRefresh, () => nfc.refresh())

  ipcMain.handle(IPC.nfcRead, (_e, card: unknown) => (isCardType(card) ? nfc.read(card) : bad('Invalid card type')))
  ipcMain.handle(IPC.nfcLock, (_e, card: unknown) => (isCardType(card) ? nfc.lock(card) : bad('Invalid card type')))
  ipcMain.handle(IPC.nfcFormat, (_e, card: unknown) => (isCardType(card) ? nfc.format(card) : bad('Invalid card type')))
  ipcMain.handle(IPC.nfcWrite, (_e, url: unknown, card: unknown) => {
    if (typeof url !== 'string' || url.length === 0 || url.length > 400) return bad('Invalid URL')
    if (!isCardType(card)) return bad('Invalid card type')
    return nfc.write(url, card)
  })

  ipcMain.handle(IPC.settingsLoad, () => settings.get())
  ipcMain.handle(IPC.settingsSave, (_e, patch: unknown) => {
    settings.update(patch)
  })

  // Only ever hand http(s) links to the OS - a card could contain anything.
  ipcMain.handle(IPC.openExternal, async (_e, url: unknown) => {
    if (typeof url !== 'string') return false
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
      await shell.openExternal(u.toString())
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(IPC.saveImage, async (event, req: SaveImageRequest) => {
    if (!req || (req.format !== 'png' && req.format !== 'jpg') || !(req.data instanceof Uint8Array)) return null
    if (req.data.byteLength > 200 * 1024 * 1024) return null
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const name = String(req.suggestedName || 'print-sheet').replace(/[\\/:*?"<>|]/g, '_')
    const options = {
      title: 'Save Print Sheet',
      defaultPath: join(app.getPath('pictures'), `${name}.${req.format}`),
      filters:
        req.format === 'jpg'
          ? [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }]
          : [{ name: 'PNG Image', extensions: ['png'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(req.data))
    return result.filePath
  })
}
