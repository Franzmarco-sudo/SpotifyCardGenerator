export type CardType = 'ntag215' | 'mifare1k'

export interface NfcState {
  /** Set when the Smart Card service (Windows) / pcscd (Linux) can't be reached. */
  serviceError: string | null
  readerName: string | null
  cardPresent: boolean
}

export interface NfcResult {
  ok: boolean
  message: string
  /** URL that was read from the card (read operations only). */
  url?: string
}

export interface UserSettings {
  cardType: CardType
  autoOpen: boolean
  linkRatio: boolean
  frontColor: string
  backColor: string
  qrColor: string
  qrSize: number
}

export const DEFAULT_SETTINGS: UserSettings = {
  cardType: 'ntag215',
  autoOpen: true,
  linkRatio: true,
  frontColor: '#FFFFFF',
  backColor: '#FFFFFF',
  qrColor: '#000000',
  qrSize: 120
}

export const EMPTY_NFC_STATE: NfcState = { serviceError: null, readerName: null, cardPresent: false }
