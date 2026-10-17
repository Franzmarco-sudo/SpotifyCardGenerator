import type { CardType, NfcResult, NfcState, UserSettings } from './types'

export const IPC = {
  nfcGetState: 'nfc:get-state',
  nfcRefresh: 'nfc:refresh',
  nfcState: 'nfc:state',
  nfcRead: 'nfc:read',
  nfcWrite: 'nfc:write',
  nfcLock: 'nfc:lock',
  nfcFormat: 'nfc:format',
  settingsLoad: 'settings:load',
  settingsSave: 'settings:save',
  openExternal: 'shell:open-external',
  saveImage: 'file:save-image'
} as const

export interface SaveImageRequest {
  data: Uint8Array
  format: 'png' | 'jpg'
  suggestedName: string
}

/** The API the preload script exposes to the renderer as `window.api`. */
export interface Api {
  nfc: {
    getState(): Promise<NfcState>
    refresh(): Promise<NfcState>
    onState(cb: (state: NfcState) => void): () => void
    read(card: CardType): Promise<NfcResult>
    write(url: string, card: CardType): Promise<NfcResult>
    lock(card: CardType): Promise<NfcResult>
    format(card: CardType): Promise<NfcResult>
  }
  settings: {
    load(): Promise<UserSettings>
    save(patch: Partial<UserSettings>): Promise<void>
  }
  openExternal(url: string): Promise<boolean>
  saveImage(req: SaveImageRequest): Promise<string | null>
}
