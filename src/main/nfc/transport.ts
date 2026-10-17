/** Anything that can exchange APDUs with a card. Real impl: PC/SC. Tests: simulated tags. */
export interface Transport {
  /** Returns the raw response (data + SW1 SW2), or an empty array on a communication error. */
  transmit(apdu: Uint8Array): Uint8Array
}
