import { join } from 'node:path'
import { BrowserWindow, Menu, app, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc'
import { PcscContext } from './nfc/pcsc'
import { NfcManager } from './nfc/nfcManager'
import { SettingsStore } from './settings/settingsStore'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
const nfc = new NfcManager(() => PcscContext.establish())

function createWindow(): void {
  const isWin = process.platform === 'win32'
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#121212',
    title: 'Spotify Card Generator',
    autoHideMenuBar: true,
    // Frameless look like the Avalonia app: native min/max/close buttons drawn over our dark bar.
    ...(isWin
      ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#121212', symbolColor: '#aaaaaa', height: 36 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // The renderer is a local app: never navigate away or open new windows inside it.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isDev || !url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\0')) e.preventDefault()
  })

  if (isDev) {
    // No application menu (so Ctrl+W / Ctrl+R reach the app), so give dev builds DevTools by hand.
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
        mainWindow?.webContents.toggleDevTools()
      }
    })
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  registerIpc(nfc, settings)

  nfc.on('state', (state) => mainWindow?.webContents.send(IPC.nfcState, state))
  nfc.start()

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => nfc.stop())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
