import { describe, expect, it } from 'vitest'
import { createNdefMessage, findNdefTlv, parseNdefMessage } from '../src/main/nfc/ndef'

const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'

describe('ndef', () => {
  it('round-trips a normal Spotify link', () => {
    const parsed = parseNdefMessage(createNdefMessage(SPOTIFY))
    expect(parsed).toEqual({ ok: true, url: SPOTIFY })
  })

  it('round-trips a share link with ?si= (longer than 64 bytes)', () => {
    const url = `${SPOTIFY}?si=1a2b3c4d5e6f7a8b`
    const msg = createNdefMessage(url)
    expect(msg.length).toBeGreaterThan(64)
    expect(parseNdefMessage(msg)).toEqual({ ok: true, url })
  })

  it('stores spotify: URIs verbatim instead of forcing https://', () => {
    const uri = 'spotify:track:4uLU6hMCjMI75M1A2tKUQC'
    const msg = createNdefMessage(uri)
    expect(msg[6]).toBe(0x00) // 03 len D1 01 plen 55 <prefix>: prefix byte = no abbreviation
    expect(parseNdefMessage(msg)).toEqual({ ok: true, url: uri })
  })

  it('uses the www abbreviations', () => {
    expect(createNdefMessage('https://www.example.com')[6]).toBe(0x02)
    expect(createNdefMessage('http://example.com')[6]).toBe(0x03)
  })

  it('finds the NDEF TLV after lock/memory control TLVs', () => {
    const body = createNdefMessage(SPOTIFY)
    const withLock = Uint8Array.from([0x01, 0x03, 0xa0, 0x0c, 0x34, 0x02, 0x03, 0xe8, 0x01, 0x00, ...body])
    expect(findNdefTlv(withLock)?.valueStart).toBe(10 + 2)
    expect(parseNdefMessage(withLock)).toEqual({ ok: true, url: SPOTIFY })
  })

  it('reports empty cards and garbage without throwing', () => {
    expect(parseNdefMessage([0x03, 0x00, 0xfe]).ok).toBe(false)
    expect(parseNdefMessage([]).ok).toBe(false)
    expect(parseNdefMessage([0xaa, 0xbb, 0xcc]).ok).toBe(false)
  })

  it('rejects URLs that do not fit a short record', () => {
    expect(() => createNdefMessage('https://' + 'a'.repeat(300))).toThrow()
  })
})
