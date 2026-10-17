import { describe, expect, it } from 'vitest'
import { formatCard, lockCard, readUrl, writeUrl } from '../src/main/nfc/nfcService'
import { FakeMifare1k, FakeNtag215 } from './fakeTags'

const URL1 = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
const LONG = `${URL1}?si=0123456789abcdef0123456789abcdef`

describe('NTAG215', () => {
  it('regression: the old single 64-byte READ is rejected by 16-byte readers', () => {
    const tag = new FakeNtag215(16)
    writeUrl(tag, URL1, 'ntag215')
    const oldCommand = Uint8Array.of(0xff, 0xb0, 0x00, 0x04, 0x40)
    expect(Array.from(tag.transmit(oldCommand))).toEqual([0x63, 0x00])
  })

  it('writes and reads back on a reader limited to 16-byte reads (the original bug)', () => {
    const tag = new FakeNtag215(16)
    expect(writeUrl(tag, URL1, 'ntag215')).toMatchObject({ ok: true, message: 'Success' })
    expect(readUrl(tag, 'ntag215')).toMatchObject({ ok: true, url: URL1 })
    // never asks for more than 16 bytes at a time
    expect(tag.log.filter((l) => l.startsWith('READ')).every((l) => l.endsWith('le 16'))).toBe(true)
  })

  it('does not truncate links longer than 64 bytes', () => {
    const tag = new FakeNtag215(16)
    expect(writeUrl(tag, LONG, 'ntag215').ok).toBe(true)
    expect(readUrl(tag, 'ntag215').url).toBe(LONG)
  })

  it('also works with readers that allow big reads', () => {
    const tag = new FakeNtag215(64)
    writeUrl(tag, LONG, 'ntag215')
    expect(readUrl(tag, 'ntag215').url).toBe(LONG)
  })

  it('writes spotify: URIs without corrupting them', () => {
    const tag = new FakeNtag215()
    const uri = 'spotify:album:1DFixLWuPkv3KT3TnV35m3'
    writeUrl(tag, uri, 'ntag215')
    expect(readUrl(tag, 'ntag215').url).toBe(uri)
  })

  it('format clears the card and read then reports it empty', () => {
    const tag = new FakeNtag215()
    writeUrl(tag, URL1, 'ntag215')
    expect(formatCard(tag, 'ntag215').ok).toBe(true)
    const res = readUrl(tag, 'ntag215')
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/empty/i)
  })

  it('reports a failed write instead of success', () => {
    const dead = { transmit: () => new Uint8Array(0) }
    expect(writeUrl(dead, URL1, 'ntag215')).toEqual({ ok: false, message: 'Write Failed (NTAG)', url: undefined })
  })

  it('reports a read failure when the reader returns nothing', () => {
    const dead = { transmit: () => new Uint8Array(0) }
    expect(readUrl(dead, 'ntag215')).toMatchObject({ ok: false, message: 'Read Failed' })
  })

  it('lock sends the static lock bytes', () => {
    const sent: number[][] = []
    const t = { transmit: (a: Uint8Array) => (sent.push(Array.from(a)), Uint8Array.of(0x90, 0x00)) }
    expect(lockCard(t, 'ntag215').ok).toBe(true)
    expect(sent[0]).toEqual([0xff, 0xd6, 0x00, 0x02, 0x04, 0x00, 0x00, 0xff, 0xff])
    expect(lockCard(t, 'mifare1k').ok).toBe(false)
  })
})

describe('MIFARE Classic 1K', () => {
  it('writes and reads back', () => {
    const tag = new FakeMifare1k()
    expect(writeUrl(tag, URL1, 'mifare1k').ok).toBe(true)
    expect(readUrl(tag, 'mifare1k')).toMatchObject({ ok: true, url: URL1 })
  })
})
