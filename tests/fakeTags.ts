import type { Transport } from '../src/main/nfc/transport'

const OK = [0x90, 0x00]
const ERR = [0x63, 0x00]

/** Simulated NTAG215 behind a PC/SC reader. `maxReadLe` mimics readers that cap READ BINARY. */
export class FakeNtag215 implements Transport {
  readonly mem = new Uint8Array(135 * 4)
  readonly log: string[] = []
  constructor(private readonly maxReadLe = 16) {
    this.mem.set([0xe1, 0x10, 0x3e, 0x00], 12) // capability container, page 3
  }

  transmit(apdu: Uint8Array): Uint8Array {
    const [cla, ins, , p2, len] = apdu
    if (cla !== 0xff) return Uint8Array.from(ERR)
    if (ins === 0xb0) {
      this.log.push(`READ page ${p2} le ${len}`)
      if (len > this.maxReadLe || p2 * 4 + len > this.mem.length) return Uint8Array.from(ERR)
      return Uint8Array.from([...this.mem.subarray(p2 * 4, p2 * 4 + len), ...OK])
    }
    if (ins === 0xd6) {
      this.log.push(`WRITE page ${p2}`)
      if (len !== 4 || p2 < 4 || p2 > 129) return Uint8Array.from(ERR)
      this.mem.set(apdu.subarray(5, 9), p2 * 4)
      return Uint8Array.from(OK)
    }
    return Uint8Array.from(ERR)
  }
}

/** Simulated MIFARE Classic 1K with factory keys. */
export class FakeMifare1k implements Transport {
  readonly mem = new Uint8Array(64 * 16)
  private authed = -1
  private key: number[] = []
  transmit(apdu: Uint8Array): Uint8Array {
    const [cla, ins, , p2] = apdu
    if (cla !== 0xff) return Uint8Array.from(ERR)
    if (ins === 0x82) {
      this.key = Array.from(apdu.subarray(5, 11))
      return Uint8Array.from(OK)
    }
    if (ins === 0x86) {
      const block = apdu[7]
      const defaultKey = this.key.every((b) => b === 0xff)
      if (!defaultKey) return Uint8Array.from(ERR)
      this.authed = Math.floor(block / 4)
      return Uint8Array.from(OK)
    }
    if (ins === 0xb0) {
      if (Math.floor(p2 / 4) !== this.authed) return Uint8Array.from(ERR)
      return Uint8Array.from([...this.mem.subarray(p2 * 16, p2 * 16 + 16), ...OK])
    }
    if (ins === 0xd6) {
      if (Math.floor(p2 / 4) !== this.authed) return Uint8Array.from(ERR)
      this.mem.set(apdu.subarray(5, 21), p2 * 16)
      return Uint8Array.from(OK)
    }
    return Uint8Array.from(ERR)
  }
}
