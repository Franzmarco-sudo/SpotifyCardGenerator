# Spotify Card Generator (Electron + React)

Design a Spotify card (front + back, QR code, tracklist, images) and write its link to an NFC tag
(NTAG215 or MIFARE Classic 1K). This is the Electron/React port of the Avalonia/.NET app.

## Requirements
- Node.js 20 or newer (22 recommended)
- An ACR122U-style PC/SC NFC reader (optional - you can design without one)
- Windows: the **Smart Card** service must be running (it is by default)

## Run it
```bash
npm install
npm run dev        # development with hot reload
npm run build      # production build into ./out
npm test           # unit tests (NFC logic, NDEF, print layout)
npm run typecheck
npm run dist       # Windows installer + portable exe into ./release (run on Windows)
```
No Visual Studio / C++ build tools needed: the PC/SC binding uses `koffi` (prebuilt binaries).

## Project layout
```
src/
  main/                 Node side (the "backend")
    nfc/
      pcsc.ts           winscard.dll / libpcsclite binding via koffi
      pcscTypes.ts      error codes, state flags, interfaces
      nfcManager.ts     reader + card watcher, runs read/write/lock/format
      nfcService.ts     NTAG215 + MIFARE logic (ported from NfcService.cs)
      ndef.ts           NDEF URI record build/parse
    settings/           settings.json in the user data folder
    ipc.ts, index.ts    IPC handlers, window creation
  preload/index.ts      the only bridge: window.api
  shared/               types + IPC contract used by both sides
  renderer/src/         React app
    features/connection/  connect screen
    features/editor/      Fabric.js card editor (cardEditor.ts), sidebar, layers, templates
    features/export/      print sheet layout + export dialog
    features/nfc/         read/write/auto-read hook
tests/                  vitest: simulated NTAG215 / MIFARE tags, NDEF, manager, sheet layout
```

## Fixes carried over from the C# app
1. **Doesn't proceed to the editor / doesn't read a card already on the reader.** PC/SC reports a
   card that is already present as its *initial* state, not as an "inserted" event, and the old app
   only listened for insert events. Now the current state is always read: the connect screen advances
   and the editor auto-reads as soon as a card is present (`shouldAutoAdvance`, `NfcManager.poll`).
   Returning to the menu with the card still on the reader waits for it to be removed first, so it
   doesn't bounce straight back.
2. **NTAG215 failing.** The old code read 64 bytes in one command; many readers only allow 16 bytes
   per READ BINARY. Reads are now 16-byte chunks until the full NDEF message is in, so long links
   (e.g. `?si=...`) are no longer cut off at 64 bytes either (`readNtagUserData`).
3. `spotify:` URIs were stored with an `https://` prefix, corrupting them. They are now stored verbatim.
4. A write is read back and verified, so a silent failure no longer shows as "Success".
5. The reader watcher recovers if the Smart Card service was down at launch (the old one never retried),
   and prefers the contactless (PICC) slot on multi-slot readers.
6. Lock and Format ask for confirmation (both are destructive). Exports honour JPG (the old one always wrote PNG).

## Known limits
- Developed and tested against simulated tags and the real PC/SC library on Linux. **Not yet tried
  with a physical reader/tag or on Windows** - please report anything odd.
- `LOCK CARD` sets only the static lock bytes (pages 3-15), as in the original.
- MIFARE write/format logic is a straight port of the C# code.
- The native FFI struct layout for Windows follows `winscard.h`; if the reader list or card state
  looks wrong on your machine, check `src/main/nfc/pcsc.ts` first.
