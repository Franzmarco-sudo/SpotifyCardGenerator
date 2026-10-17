// NDEF URI record helpers (NFC Forum Type 2 / Type 4 style TLV wrapper).

const URI_PREFIXES: Array<[string, number]> = [
  ['https://www.', 0x02],
  ['https://', 0x04],
  ['http://www.', 0x01],
  ['http://', 0x03]
]
const PREFIX_TEXT: Record<number, string> = {
  0x00: '',
  0x01: 'http://www.',
  0x02: 'https://www.',
  0x03: 'http://',
  0x04: 'https://'
}

export const MAX_SHORT_RECORD = 255

/**
 * Builds `03 <len> D1 01 <len> 55 <prefix> <uri> FE`.
 *
 * Fix vs. the C# version: URIs that match no known prefix (e.g. `spotify:track:...`) used to be
 * stored with the "https://" prefix, which turned them into broken `https://spotify:track:...`
 * links. They are now stored verbatim (prefix 0x00).
 */
export function createNdefMessage(url: string): Uint8Array {
  let prefixCode = 0x00
  let rest = url
  for (const [text, code] of URI_PREFIXES) {
    if (url.startsWith(text)) {
      prefixCode = code
      rest = url.slice(text.length)
      break
    }
  }
  const uri = new TextEncoder().encode(rest)
  const payloadLen = 1 + uri.length
  if (payloadLen > MAX_SHORT_RECORD) throw new Error('URL is too long')

  const record = [0xd1, 0x01, payloadLen, 0x55, prefixCode, ...uri]
  const tlv: number[] = [0x03]
  if (record.length < 0xff) tlv.push(record.length)
  else tlv.push(0xff, (record.length >> 8) & 0xff, record.length & 0xff)
  tlv.push(...record, 0xfe)
  return Uint8Array.from(tlv)
}

export interface NdefTlv {
  /** index of the first NDEF message byte (after the TLV header) */
  valueStart: number
  length: number
  /** total bytes from the start of the buffer to the end of the terminator TLV */
  totalLength: number
}

/**
 * Walks the TLV list (skipping NULL 0x00, lock-control 0x01 and memory-control 0x02 TLVs)
 * and returns the location of the NDEF message TLV (0x03), or null if it isn't (fully) visible.
 */
export function findNdefTlv(bytes: ArrayLike<number>): NdefTlv | null {
  let i = 0
  while (i < bytes.length) {
    const tag = bytes[i]
    if (tag === 0x00) {
      i += 1
      continue
    }
    if (tag === 0xfe) return null
    if (i + 1 >= bytes.length) return null
    let len = bytes[i + 1]
    let header = 2
    if (len === 0xff) {
      if (i + 3 >= bytes.length) return null
      len = (bytes[i + 2] << 8) | bytes[i + 3]
      header = 4
    }
    if (tag === 0x03) {
      return { valueStart: i + header, length: len, totalLength: i + header + len + 1 }
    }
    i += header + len
  }
  return null
}

export type ParsedNdef = { ok: true; url: string } | { ok: false; reason: string }

const hex = (b: ArrayLike<number>, n = 16): string =>
  Array.from({ length: Math.min(n, b.length) }, (_, i) => b[i].toString(16).padStart(2, '0')).join(' ')

export function parseNdefMessage(data: ArrayLike<number>): ParsedNdef {
  if (!data || data.length === 0) return { ok: false, reason: 'Empty Data' }
  const tlv = findNdefTlv(data)
  if (!tlv) return { ok: false, reason: `No NDEF message found (${hex(data)})` }
  if (tlv.length === 0) return { ok: false, reason: 'Card is empty (no NDEF record)' }

  const end = Math.min(tlv.valueStart + tlv.length, data.length)
  let p = tlv.valueStart
  const flags = data[p++]
  const shortRecord = (flags & 0x10) !== 0
  const hasId = (flags & 0x08) !== 0
  const tnf = flags & 0x07
  const typeLen = data[p++]
  let payloadLen: number
  if (shortRecord) payloadLen = data[p++]
  else {
    payloadLen = ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3]) >>> 0
    p += 4
  }
  const idLen = hasId ? data[p++] : 0
  const type = String.fromCharCode(...Array.from({ length: typeLen }, (_, k) => data[p + k]))
  p += typeLen + idLen

  if (tnf !== 0x01 || type !== 'U') return { ok: false, reason: `Not a URL record (${hex(data)})` }
  if (p >= end) return { ok: false, reason: `Record is truncated (${hex(data)})` }

  const prefix = PREFIX_TEXT[data[p]] ?? ''
  const bodyEnd = Math.min(p + payloadLen, end)
  const body = Uint8Array.from(Array.from({ length: bodyEnd - (p + 1) }, (_, k) => data[p + 1 + k]))
  return { ok: true, url: prefix + new TextDecoder().decode(body) }
}
