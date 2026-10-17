import { EventEmitter } from 'node:events'
import { EMPTY_NFC_STATE, type CardType, type NfcResult, type NfcState } from '@shared/types'
import * as service from './nfcService'
import {
  PcscError,
  SCARD_ERR,
  SCARD_STATE,
  describeError,
  type PcscContextLike
} from './pcscTypes'
import type { Transport } from './transport'

/** Contactless readers such as the ACR1252U expose several slots; prefer the card (PICC) one. */
export function pickReader(readers: string[], current: string | null): string | null {
  if (readers.length === 0) return null
  if (current && readers.includes(current)) return current
  return readers.find((r) => /picc|contactless|\bcl\b|nfc/i.test(r)) ?? readers[0]
}

export class NfcManager extends EventEmitter {
  private ctx: PcscContextLike | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private state: NfcState = { ...EMPTY_NFC_STATE }

  constructor(
    private readonly createContext: () => PcscContextLike,
    private readonly pollMs = 750
  ) {
    super()
  }

  start(): void {
    if (this.timer) return
    this.poll()
    this.timer = setInterval(() => this.poll(), this.pollMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.dropContext()
  }

  getState(): NfcState {
    return this.state
  }

  /** Forces an immediate hardware check (used by the "Retry" button). */
  refresh(): NfcState {
    this.poll()
    return this.state
  }

  poll(): void {
    const next: NfcState = { serviceError: null, readerName: null, cardPresent: false }
    try {
      // Re-establishing on every failure also fixes the C# version, which gave up forever after
      // a single "Smart Card service" error.
      if (!this.ctx) this.ctx = this.createContext()
      const readers = this.ctx.listReaders()
      next.readerName = pickReader(readers, this.state.readerName)
      if (next.readerName) {
        const flags = this.ctx.readerState(next.readerName)
        next.cardPresent = (flags & SCARD_STATE.PRESENT) !== 0
      }
    } catch (e) {
      this.dropContext()
      next.readerName = null
      next.cardPresent = false
      if (e instanceof PcscError) {
        next.serviceError =
          e.code === SCARD_ERR.NO_SERVICE || e.code === SCARD_ERR.SERVICE_STOPPED
            ? 'Smart Card service is not running'
            : e.code === SCARD_ERR.NO_READERS_AVAILABLE
              ? null
              : describeError(e.code)
      } else {
        next.serviceError = (e as Error).message
      }
    }

    const prev = this.state
    if (
      prev.readerName !== next.readerName ||
      prev.cardPresent !== next.cardPresent ||
      prev.serviceError !== next.serviceError
    ) {
      this.state = next
      this.emit('state', next)
    }
  }

  // ---------------------------------------------------------------- card operations

  read(card: CardType): NfcResult {
    return this.run((t) => service.readUrl(t, card))
  }
  write(url: string, card: CardType): NfcResult {
    return this.run((t) => service.writeUrl(t, url, card))
  }
  lock(card: CardType): NfcResult {
    return this.run((t) => service.lockCard(t, card))
  }
  format(card: CardType): NfcResult {
    return this.run((t) => service.formatCard(t, card))
  }

  /** Opens a short-lived shared connection to the current reader, like the C# NfcService did. */
  private run(op: (t: Transport) => NfcResult): NfcResult {
    const reader = this.state.readerName
    if (!reader) return { ok: false, message: 'No reader connected' }

    let ctx: PcscContextLike | null = null
    try {
      ctx = this.createContext()
      const session = ctx.connect(reader)
      try {
        return op(session)
      } finally {
        session.disconnect()
      }
    } catch (e) {
      if (e instanceof PcscError) return { ok: false, message: describeError(e.code) }
      return { ok: false, message: `Error: ${(e as Error).message}` }
    } finally {
      ctx?.release()
    }
  }

  private dropContext(): void {
    try {
      this.ctx?.release()
    } catch {
      /* ignore */
    }
    this.ctx = null
  }
}
