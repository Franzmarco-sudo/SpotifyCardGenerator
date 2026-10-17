import type { NfcState } from '@shared/types'

/**
 * Should the connect screen move on to the editor?
 *
 * FIX: the C# app only reacted to a card being *inserted* after monitoring started, so a card that
 * was already on the reader (or placed just before the reader was recognised) never advanced. We
 * look at the current state instead, so both cases work.
 *
 * `waitForRemoval` is set when the user came back from the editor with the card still on the
 * reader; the card has to leave the reader once before it can trigger another redirect.
 */
export function shouldAutoAdvance(nfc: NfcState, waitForRemoval: boolean): boolean {
  return nfc.readerName !== null && nfc.cardPresent && !waitForRemoval
}
