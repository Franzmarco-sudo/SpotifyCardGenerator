import { describe, expect, it } from 'vitest'
import { NfcManager, pickReader } from '../src/main/nfc/nfcManager'
import { PcscError, SCARD_ERR, SCARD_STATE, type PcscContextLike } from '../src/main/nfc/pcscTypes'
import type { NfcState } from '../src/shared/types'

function fakeContext(script: { readers: string[]; flags: number }): PcscContextLike {
  return {
    listReaders: () => script.readers,
    readerState: () => script.flags,
    connect: () => {
      throw new Error('not used')
    },
    release: () => undefined
  }
}

describe('NfcManager', () => {
  it('reports a card that was already on the reader when the reader appears', () => {
    // This is the "doesn't proceed to the editor" bug: the card never produced an *insert* event.
    const script = { readers: ['ACS ACR122 0'], flags: SCARD_STATE.PRESENT | SCARD_STATE.CHANGED }
    const mgr = new NfcManager(() => fakeContext(script))
    const seen: NfcState[] = []
    mgr.on('state', (s) => seen.push(s))
    mgr.poll()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({ serviceError: null, readerName: 'ACS ACR122 0', cardPresent: true })
  })

  it('tracks insert / remove and only emits on change', () => {
    const script: { readers: string[]; flags: number } = { readers: ['R'], flags: SCARD_STATE.EMPTY }
    const mgr = new NfcManager(() => fakeContext(script))
    const seen: NfcState[] = []
    mgr.on('state', (s) => seen.push(s))
    mgr.poll()
    mgr.poll()
    script.flags = SCARD_STATE.PRESENT
    mgr.poll()
    mgr.poll()
    script.flags = SCARD_STATE.EMPTY
    mgr.poll()
    expect(seen.map((s) => s.cardPresent)).toEqual([false, true, false])
  })

  it('detects unplugging and re-plugging', () => {
    const script: { readers: string[]; flags: number } = { readers: ['R'], flags: SCARD_STATE.EMPTY }
    const mgr = new NfcManager(() => fakeContext(script))
    mgr.poll()
    script.readers = []
    mgr.poll()
    expect(mgr.getState().readerName).toBeNull()
    script.readers = ['R']
    mgr.poll()
    expect(mgr.getState().readerName).toBe('R')
  })

  it('recovers after the Smart Card service was down (the C# app never did)', () => {
    let up = false
    const mgr = new NfcManager(() => {
      if (!up) throw new PcscError(SCARD_ERR.NO_SERVICE, 'SCardEstablishContext')
      return fakeContext({ readers: ['R'], flags: SCARD_STATE.EMPTY })
    })
    mgr.poll()
    expect(mgr.getState().serviceError).toMatch(/not running/);
    up = true
    mgr.poll()
    expect(mgr.getState()).toEqual({ serviceError: null, readerName: 'R', cardPresent: false })
  })

  it('operations without a reader fail cleanly', () => {
    const mgr = new NfcManager(() => fakeContext({ readers: [], flags: 0 }))
    expect(mgr.read('ntag215')).toEqual({ ok: false, message: 'No reader connected' })
  })

  it('prefers the contactless slot on multi-slot readers', () => {
    expect(pickReader(['ACS ACR1252 SAM 0', 'ACS ACR1252 1S CL Reader PICC 0'], null)).toContain('PICC')
    expect(pickReader(['A', 'B'], 'B')).toBe('B')
    expect(pickReader([], null)).toBeNull()
  })
})
