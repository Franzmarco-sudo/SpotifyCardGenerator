import type { CardType, NfcResult } from '@shared/types'
import { createNdefMessage, findNdefTlv, parseNdefMessage } from './ndef'
import type { Transport } from './transport'

// ---- MIFARE keys (same as the original app) ----
const KEY_DEFAULT = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
const KEY_NDEF = [0xd3, 0xf7, 0xd3, 0xf7, 0xd3, 0xf7]
const KEY_MADMAN = [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]

const NTAG215_USER_BYTES = 504 // pages 4..129
const NTAG_READ_LIMIT = 496

const ok = (message: string, url?: string): NfcResult => ({ ok: true, message, url })
const fail = (message: string): NfcResult => ({ ok: false, message })

// ---------------------------------------------------------------------------------------------
// Raw helpers
// ---------------------------------------------------------------------------------------------

function isSuccess(resp: Uint8Array): boolean {
  return resp.length >= 2 && resp[resp.length - 2] === 0x90 && resp[resp.length - 1] === 0x00
}

function readBlockRaw(t: Transport, block: number): number[] {
  const resp = t.transmit(Uint8Array.of(0xff, 0xb0, 0x00, block, 0x10))
  return isSuccess(resp) ? Array.from(resp.subarray(0, 16)) : []
}

function writeBlockRaw(t: Transport, block: number, data: ArrayLike<number>): boolean {
  return isSuccess(t.transmit(Uint8Array.from([0xff, 0xd6, 0x00, block, data.length, ...Array.from(data)])))
}

function authenticateRaw(t: Transport, block: number, key: number[], keyType: number): boolean {
  if (!isSuccess(t.transmit(Uint8Array.from([0xff, 0x82, 0x00, 0x00, 0x06, ...key])))) return false
  return isSuccess(t.transmit(Uint8Array.of(0xff, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, block, keyType, 0x00)))
}

function tryAuthenticateAnyKey(t: Transport, block: number): boolean {
  for (const key of [KEY_DEFAULT, KEY_NDEF, KEY_MADMAN]) {
    if (authenticateRaw(t, block, key, 0x60)) return true
    if (authenticateRaw(t, block, key, 0x61)) return true
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// NTAG215
// ---------------------------------------------------------------------------------------------

/**
 * FIX (NTAG215 read): the C# version requested 64 bytes in one READ BINARY. Many readers
 * (ACR122U and friends) only allow 16 bytes (4 pages) per command, so the read failed. We now read
 * 16-byte chunks until the whole NDEF TLV has been received, so long links (e.g. with `?si=...`)
 * are no longer truncated at 64 bytes either.
 */
export function readNtagUserData(t: Transport): Uint8Array {
  const data: number[] = []
  let needed = 16
  for (let page = 4; data.length < needed && data.length < NTAG_READ_LIMIT; page += 4) {
    const resp = t.transmit(Uint8Array.of(0xff, 0xb0, 0x00, page, 0x10))
    if (!isSuccess(resp) || resp.length < 18) break
    data.push(...Array.from(resp.subarray(0, 16)))
    if (data.length === 16) {
      const tlv = findNdefTlv(data)
      if (tlv) needed = Math.min(tlv.totalLength, NTAG_READ_LIMIT)
    }
  }
  return Uint8Array.from(data)
}

function writeNtag215(t: Transport, message: Uint8Array): boolean {
  const padded = new Uint8Array(Math.ceil(message.length / 4) * 4)
  padded.set(message)
  let page = 4
  for (let i = 0; i < padded.length; i += 4) {
    const cmd = Uint8Array.of(0xff, 0xd6, 0x00, page, 0x04, ...Array.from(padded.subarray(i, i + 4)))
    if (!isSuccess(t.transmit(cmd))) return false
    page++
  }
  return true
}

// ---------------------------------------------------------------------------------------------
// MIFARE Classic 1K
// ---------------------------------------------------------------------------------------------

function fixMifareMad(t: Transport): boolean {
  if (!tryAuthenticateAnyKey(t, 0)) return false
  const mad = [0x14, 0x01, 0x03, 0xe1, 0x03, 0xe1, 0x03, 0xe1, 0x03, 0xe1, 0x03, 0xe1, 0x03, 0xe1, 0x03, 0xe1]
  writeBlockRaw(t, 1, mad)
  writeBlockRaw(t, 2, mad)
  return true
}

function writeMifareClassic(t: Transport, message: Uint8Array): boolean {
  const padded = new Uint8Array(Math.ceil(message.length / 16) * 16)
  padded.set(message)
  let block = 4
  for (let i = 0; i < padded.length; i += 16) {
    if ((block + 1) % 4 === 0) block++ // skip sector trailer
    if (!tryAuthenticateAnyKey(t, block)) return false
    if (!writeBlockRaw(t, block, padded.subarray(i, i + 16))) return false
    block++
  }
  return true
}

function factoryResetMifare(t: Transport): boolean {
  const trailer = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x07, 0x80, 0x69, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
  const empty = new Array(16).fill(0)
  let success = true
  for (let sector = 0; sector < 16; sector++) {
    const first = sector * 4
    if (!tryAuthenticateAnyKey(t, first)) {
      success = false
      continue
    }
    for (let b = 0; b < 3; b++) {
      if (first + b === 0) continue
      writeBlockRaw(t, first + b, empty)
    }
    if (!writeBlockRaw(t, first + 3, trailer)) success = false
  }
  return success
}

// ---------------------------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------------------------

export function readUrl(t: Transport, card: CardType): NfcResult {
  try {
    let data: number[]
    if (card === 'ntag215') {
      const bytes = readNtagUserData(t)
      if (bytes.length === 0) return fail('Read Failed')
      data = Array.from(bytes)
    } else {
      // Read data blocks only; sector trailers (7, 11, ...) are skipped.
      data = []
      if (!tryAuthenticateAnyKey(t, 4)) return fail('Auth Failed (Sec 1)')
      for (const b of [4, 5, 6]) data.push(...readBlockRaw(t, b))
      if (tryAuthenticateAnyKey(t, 8)) for (const b of [8, 9, 10]) data.push(...readBlockRaw(t, b))
    }
    const parsed = parseNdefMessage(data)
    return parsed.ok ? ok('Read Success', parsed.url) : fail(parsed.reason)
  } catch {
    return fail('Read Exception')
  }
}

export function writeUrl(t: Transport, url: string, card: CardType): NfcResult {
  let message: Uint8Array
  try {
    message = createNdefMessage(url)
  } catch (e) {
    return fail((e as Error).message)
  }

  try {
    if (card === 'ntag215') {
      if (message.length > NTAG215_USER_BYTES) return fail('URL too long for NTAG215')
      if (!writeNtag215(t, message)) return fail('Write Failed (NTAG)')

      // Read back so a silent failure never shows up as "Success".
      const check = readUrl(t, 'ntag215')
      if (check.ok && check.url !== url) return fail('Write verification failed')
      return ok(check.ok ? 'Success' : 'Success (could not verify)')
    }

    if (!fixMifareMad(t)) return fail('Error: Init MAD Failed')
    return writeMifareClassic(t, message) ? ok('Success') : fail('Write Failed (Mifare)')
  } catch (e) {
    return fail(`Ex: ${(e as Error).message}`)
  }
}

export function formatCard(t: Transport, card: CardType): NfcResult {
  try {
    if (card === 'mifare1k') return factoryResetMifare(t) ? ok('Success') : fail('Reset Failed')
    const empty = Uint8Array.of(0xff, 0xd6, 0x00, 0x04, 0x04, 0x03, 0x00, 0xfe, 0x00)
    return isSuccess(t.transmit(empty)) ? ok('Success') : fail('Format Failed')
  } catch (e) {
    return fail(`Error: ${(e as Error).message}`)
  }
}

/** Sets the static lock bytes (permanent). Not supported for MIFARE Classic. */
export function lockCard(t: Transport, card: CardType): NfcResult {
  if (card === 'mifare1k') return fail('Locking is not supported for MIFARE Classic')
  try {
    const cmd = Uint8Array.of(0xff, 0xd6, 0x00, 0x02, 0x04, 0x00, 0x00, 0xff, 0xff)
    return isSuccess(t.transmit(cmd)) ? ok('Card Locked Permanently') : fail('Lock Failed')
  } catch {
    return fail('Lock Failed')
  }
}
