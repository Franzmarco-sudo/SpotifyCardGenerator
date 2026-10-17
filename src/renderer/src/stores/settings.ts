import { create } from 'zustand'
import { DEFAULT_SETTINGS, type UserSettings } from '@shared/types'

interface SettingsStore {
  settings: UserSettings
  loaded: boolean
  load: () => Promise<void>
  patch: (patch: Partial<UserSettings>) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let pending: Partial<UserSettings> = {}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await window.api.settings.load()
    set({ settings, loaded: true })
  },
  patch: (patch) => {
    set({ settings: { ...get().settings, ...patch } })
    // Debounced so dragging a colour picker or slider doesn't hammer the disk.
    pending = { ...pending, ...patch }
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const toSave = pending
      pending = {}
      void window.api.settings.save(toSave)
    }, 400)
  }
}))
