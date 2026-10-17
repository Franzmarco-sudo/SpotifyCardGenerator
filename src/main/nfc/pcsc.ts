import koffi from 'koffi'
import { PcscError, SCARD_ERR, type PcscContextLike, type PcscSessionLike } from './pcscTypes'

/**
 * Minimal PC/SC binding built on koffi (prebuilt native FFI - no node-gyp / Visual Studio build
 * tools needed). Talks to winscard.dll on Windows, libpcsclite on Linux and PCSC.framework on macOS.
 * Windows is the primary target; the others are best-effort.
 */

const win = process.platform === 'win32'
const mac = process.platform === 'darwin'

// Type widths differ per platform (DWORD is 32-bit on Windows/macOS, `unsigned long` on Linux).
const DWORD = win || mac ? 'uint32_t' : 'unsigned long'
const DWORD_SIZE = win || mac ? 4 : 8
const LONG = win || mac ? 'int32_t' : 'long'
const HANDLE = win ? 'uintptr_t' : mac ? 'int32_t' : 'intptr_t'
const SFX = win ? 'A' : '' // Windows exports ANSI variants as SCardXxxA
const ATR_LEN = win ? 36 : 33

const SCOPE_SYSTEM = 2
const SHARE_SHARED = 2
const LEAVE_CARD = 0
const PROTO_T0 = 1
const PROTO_T1 = 2
const PROTO_RAW = 4

interface Binding {
  establish: (scope: number, a: null, b: null, out: unknown[]) => number
  release: (ctx: unknown) => number
  listReaders: (ctx: unknown, groups: null, buf: Buffer | null, len: number[]) => number
  getStatusChange: (ctx: unknown, timeout: number, states: unknown[], n: number) => number
  connect: (ctx: unknown, reader: string, share: number, protos: number, card: unknown[], active: number[]) => number
  disconnect: (card: unknown, disposition: number) => number
  transmit: (
    card: unknown,
    pci: { dwProtocol: number; cbPciLength: number },
    send: Buffer,
    sendLen: number,
    recvPci: null,
    recv: Buffer,
    recvLen: number[]
  ) => number
}

let cached: Binding | null = null

function loadBinding(): Binding {
  if (cached) return cached

  let lib: ReturnType<typeof koffi.load>
  if (win) lib = koffi.load('winscard.dll')
  else if (mac) lib = koffi.load('/System/Library/Frameworks/PCSC.framework/PCSC')
  else {
    try {
      lib = koffi.load('libpcsclite.so.1')
    } catch {
      lib = koffi.load('libpcsclite.so')
    }
  }

  const readerFields = {
    szReader: 'const char *',
    pvUserData: 'void *',
    dwCurrentState: DWORD,
    dwEventState: DWORD,
    cbAtr: DWORD,
    rgbAtr: koffi.array('uint8_t', ATR_LEN)
  }
  // pcsc-lite on macOS declares these structs with #pragma pack(1)
  if (mac) koffi.pack('SCARD_READERSTATE', readerFields)
  else koffi.struct('SCARD_READERSTATE', readerFields)
  const ioFields = { dwProtocol: DWORD, cbPciLength: DWORD }
  if (mac) koffi.pack('SCARD_IO_REQUEST', ioFields)
  else koffi.struct('SCARD_IO_REQUEST', ioFields)

  cached = {
    establish: lib.func(`${LONG} SCardEstablishContext(${DWORD} scope, void *r1, void *r2, _Out_ ${HANDLE} *ctx)`),
    release: lib.func(`${LONG} SCardReleaseContext(${HANDLE} ctx)`),
    listReaders: lib.func(
      `${LONG} SCardListReaders${SFX}(${HANDLE} ctx, const char *groups, _Out_ uint8_t *readers, _Inout_ ${DWORD} *len)`
    ),
    getStatusChange: lib.func(
      `${LONG} SCardGetStatusChange${SFX}(${HANDLE} ctx, ${DWORD} timeout, _Inout_ SCARD_READERSTATE *states, ${DWORD} count)`
    ),
    connect: lib.func(
      `${LONG} SCardConnect${SFX}(${HANDLE} ctx, const char *reader, ${DWORD} share, ${DWORD} protocols, _Out_ ${HANDLE} *card, _Out_ ${DWORD} *active)`
    ),
    disconnect: lib.func(`${LONG} SCardDisconnect(${HANDLE} card, ${DWORD} disposition)`),
    transmit: lib.func(
      `${LONG} SCardTransmit(${HANDLE} card, SCARD_IO_REQUEST *sendPci, const uint8_t *send, ${DWORD} sendLen, void *recvPci, _Out_ uint8_t *recv, _Inout_ ${DWORD} *recvLen)`
    )
  } as Binding
  return cached
}

/** Windows returns negative LONGs for 0x8010xxxx codes; normalise to unsigned. */
const u32 = (rc: number): number => rc >>> 0

function check(rc: number, operation: string): void {
  const code = u32(rc)
  if (code !== 0) throw new PcscError(code, operation)
}

class PcscSession implements PcscSessionLike {
  constructor(
    private readonly b: Binding,
    private readonly card: unknown,
    private readonly protocol: number
  ) {}

  transmit(apdu: Uint8Array): Uint8Array {
    const recv = Buffer.alloc(300)
    const len = [recv.length]
    const pci = { dwProtocol: this.protocol, cbPciLength: DWORD_SIZE * 2 }
    const rc = u32(this.b.transmit(this.card, pci, Buffer.from(apdu), apdu.length, null, recv, len))
    if (rc !== 0) return new Uint8Array(0)
    return new Uint8Array(recv.subarray(0, len[0]))
  }

  disconnect(): void {
    try {
      this.b.disconnect(this.card, LEAVE_CARD)
    } catch {
      /* ignore */
    }
  }
}

export class PcscContext implements PcscContextLike {
  private constructor(
    private readonly b: Binding,
    private readonly ctx: unknown
  ) {}

  static establish(): PcscContext {
    const b = loadBinding()
    const out: unknown[] = [0]
    check(b.establish(SCOPE_SYSTEM, null, null, out), 'SCardEstablishContext')
    return new PcscContext(b, out[0])
  }

  listReaders(): string[] {
    const len = [0]
    let rc = u32(this.b.listReaders(this.ctx, null, null, len))
    if (rc === SCARD_ERR.NO_READERS_AVAILABLE) return []
    check(rc, 'SCardListReaders')

    const buf = Buffer.alloc(len[0])
    rc = u32(this.b.listReaders(this.ctx, null, buf, len))
    if (rc === SCARD_ERR.NO_READERS_AVAILABLE) return []
    check(rc, 'SCardListReaders')
    return buf
      .subarray(0, len[0])
      .toString('utf8')
      .split('\0')
      .filter((s) => s.length > 0)
  }

  readerState(reader: string): number {
    // currentState = UNAWARE makes the call return immediately with the reader's present state,
    // including a card that was already on the reader before we started looking.
    const states = [
      { szReader: reader, pvUserData: null, dwCurrentState: 0, dwEventState: 0, cbAtr: 0, rgbAtr: new Array(ATR_LEN).fill(0) }
    ]
    const rc = u32(this.b.getStatusChange(this.ctx, 0, states, 1))
    if (rc !== 0 && rc !== SCARD_ERR.TIMEOUT) throw new PcscError(rc, 'SCardGetStatusChange')
    return states[0].dwEventState
  }

  connect(reader: string): PcscSessionLike {
    // The C# app used T0|T1. If a reader/card combination rejects that, try narrower choices.
    const attempts = [PROTO_T0 | PROTO_T1, PROTO_T1, PROTO_T0, PROTO_RAW]
    let lastCode = 0
    for (const protocols of attempts) {
      const card: unknown[] = [0]
      const active = [0]
      const rc = u32(this.b.connect(this.ctx, reader, SHARE_SHARED, protocols, card, active))
      if (rc === 0) return new PcscSession(this.b, card[0], active[0])
      lastCode = rc
      if (rc !== SCARD_ERR.PROTO_MISMATCH) break
    }
    throw new PcscError(lastCode, 'SCardConnect')
  }

  release(): void {
    try {
      this.b.release(this.ctx)
    } catch {
      /* ignore */
    }
  }
}
