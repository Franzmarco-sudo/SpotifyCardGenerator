import type { Transport } from './transport'

/** SCARD_STATE_* flags (identical on Windows and pcsc-lite). */
export const SCARD_STATE = {
  UNAWARE: 0x0000,
  IGNORE: 0x0001,
  CHANGED: 0x0002,
  UNKNOWN: 0x0004,
  UNAVAILABLE: 0x0008,
  EMPTY: 0x0010,
  PRESENT: 0x0020,
  MUTE: 0x0200,
  UNPOWERED: 0x0400
} as const

/** PC/SC return codes (unsigned 32-bit representation). */
export const SCARD_ERR = {
  INVALID_HANDLE: 0x80100003,
  UNKNOWN_READER: 0x80100009,
  TIMEOUT: 0x8010000a,
  SHARING_VIOLATION: 0x8010000b,
  NO_SMARTCARD: 0x8010000c,
  PROTO_MISMATCH: 0x8010000f,
  NOT_READY: 0x80100010,
  READER_UNAVAILABLE: 0x80100017,
  NO_SERVICE: 0x8010001d,
  SERVICE_STOPPED: 0x8010001e,
  NO_READERS_AVAILABLE: 0x8010002e,
  REMOVED_CARD: 0x80100069
} as const

export function describeError(code: number): string {
  switch (code) {
    case SCARD_ERR.NO_SERVICE:
    case SCARD_ERR.SERVICE_STOPPED:
      return 'Smart Card service is not running'
    case SCARD_ERR.NO_READERS_AVAILABLE:
      return 'No reader found'
    case SCARD_ERR.NO_SMARTCARD:
      return 'No card on the reader'
    case SCARD_ERR.REMOVED_CARD:
      return 'Card was removed'
    case SCARD_ERR.SHARING_VIOLATION:
      return 'Reader is busy (another program is using it)'
    case SCARD_ERR.READER_UNAVAILABLE:
      return 'Reader is unavailable'
    case SCARD_ERR.PROTO_MISMATCH:
      return 'Card protocol mismatch'
    default:
      return `PC/SC error 0x${code.toString(16)}`
  }
}

export class PcscError extends Error {
  constructor(
    public readonly code: number,
    public readonly operation: string
  ) {
    super(`${operation}: ${describeError(code)}`)
    this.name = 'PcscError'
  }
}

export interface PcscSessionLike extends Transport {
  disconnect(): void
}

export interface PcscContextLike {
  /** Names of all connected readers (empty when none). */
  listReaders(): string[]
  /** Current SCARD_STATE_* flags of a reader. */
  readerState(reader: string): number
  connect(reader: string): PcscSessionLike
  release(): void
}
