import { create } from 'zustand'
import { EMPTY_NFC_STATE, type NfcState } from '@shared/types'

interface NfcStore {
  state: NfcState
  ready: boolean
  init: () => Promise<() => void>
  refresh: () => Promise<void>
}

export const useNfc = create<NfcStore>((set) => ({
  state: EMPTY_NFC_STATE,
  ready: false,
  init: async () => {
    const off = window.api.nfc.onState((state) => set({ state }))
    // The current state is fetched explicitly: a card that is already on the reader never
    // produces a "change" event, so subscribing alone would miss it.
    set({ state: await window.api.nfc.getState(), ready: true })
    return off
  },
  refresh: async () => set({ state: await window.api.nfc.refresh() })
}))
