/// <reference types="react" />
import type { Api } from '@shared/ipc'

declare global {
  interface Window {
    api: Api
    queryLocalFonts?: () => Promise<Array<{ family: string }>>
  }
}

export {}
