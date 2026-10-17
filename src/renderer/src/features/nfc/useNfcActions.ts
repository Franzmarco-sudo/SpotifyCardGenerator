import { useCallback, useEffect, useRef, useState } from 'react'
import type { NfcResult } from '@shared/types'
import { useNfc } from '@renderer/stores/nfc'
import { useSettings } from '@renderer/stores/settings'
import { useToast } from '@renderer/stores/toast'

export type Tone = 'idle' | 'busy' | 'ok' | 'err' | 'info'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const isSpotify = (url: string): boolean => url.includes('https://open.spotify.com/') || url.startsWith('spotify:')

export function useNfcActions(getUrl: () => string) {
  const nfc = useNfc((s) => s.state)
  const cardType = useSettings((s) => s.settings.cardType)
  const autoOpen = useSettings((s) => s.settings.autoOpen)
  const toast = useToast((s) => s.show)

  const [status, setStatus] = useState<{ text: string; tone: Tone }>({ text: 'Ready...', tone: 'idle' })
  const [readOutput, setReadOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const run = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await fn()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const read = useCallback(
    () =>
      run(async () => {
        setStatus({ text: 'Reading...', tone: 'busy' })
        const res = await window.api.nfc.read(cardType)
        if (res.ok && res.url) {
          setReadOutput(res.url)
          setStatus({ text: 'Read Success', tone: 'ok' })
        } else {
          setReadOutput(`<${res.message}>`)
          setStatus({ text: res.message, tone: 'err' })
        }
      }),
    [run, cardType]
  )

  const write = useCallback(
    () =>
      run(async () => {
        const url = getUrl().trim()
        if (!url) {
          setStatus({ text: 'Error: No URL', tone: 'err' })
          toast('Error: No URL provided', false)
          return
        }
        if (!isSpotify(url)) {
          setStatus({ text: 'Invalid Link', tone: 'err' })
          toast('Error: Not a valid Spotify link!', false)
          return
        }
        setStatus({ text: 'Writing...', tone: 'busy' })
        const res = await window.api.nfc.write(url, cardType)
        if (res.ok) {
          setStatus({ text: 'Success!', tone: 'ok' })
          toast('Card Written Successfully!', true)
        } else {
          setStatus({ text: res.message, tone: 'err' })
          toast(`Write Failed: ${res.message}`, false)
        }
      }),
    [run, getUrl, cardType, toast]
  )

  const lock = useCallback(
    () =>
      run(async () => {
        if (!window.confirm('Locking is PERMANENT - the card can never be written again. Continue?')) return
        setStatus({ text: 'Locking...', tone: 'busy' })
        const res = await window.api.nfc.lock(cardType)
        setStatus({ text: res.ok ? 'Locked!' : 'Failed', tone: res.ok ? 'ok' : 'err' })
        toast(res.ok ? 'Card Locked Permanently' : `Lock Failed: ${res.message}`, res.ok)
      }),
    [run, cardType, toast]
  )

  const format = useCallback(
    () =>
      run(async () => {
        if (!window.confirm('Formatting erases everything on the card. Continue?')) return
        setStatus({ text: 'Formatting...', tone: 'busy' })
        const res = await window.api.nfc.format(cardType)
        setStatus({ text: res.ok ? 'Formatted!' : res.message, tone: res.ok ? 'ok' : 'err' })
        toast(res.ok ? 'Card Formatted Successfully' : `Format Failed: ${res.message}`, res.ok)
      }),
    [run, cardType, toast]
  )

  /**
   * Reads a card as soon as it shows up - including a card that is ALREADY on the reader when the
   * editor opens (the C# version only reacted to later status changes, so it never read it).
   */
  const present = nfc.readerName !== null && nfc.cardPresent
  const wasPresent = useRef(false)
  useEffect(() => {
    if (present && !wasPresent.current) {
      void run(async () => {
        await delay(250) // let the tag settle
        let res: NfcResult = await window.api.nfc.read('ntag215')
        if (!res.ok || !res.url) res = await window.api.nfc.read('mifare1k')
        if (res.ok && res.url) {
          setReadOutput(res.url)
          setStatus({ text: 'Card Detected!', tone: 'info' })
          if (autoOpen && /^https?:\/\//i.test(res.url)) void window.api.openExternal(res.url)
        } else {
          setStatus({ text: 'Card Detected (no link found)', tone: 'idle' })
        }
      })
    }
    wasPresent.current = present
  }, [present, run, autoOpen])

  const indicator = !nfc.readerName
    ? { ok: false, text: 'Disconnected' }
    : nfc.cardPresent
      ? { ok: true, text: 'Card Connected' }
      : { ok: false, text: 'No Card' }

  return { status, readOutput, busy, indicator, read, write, lock, format }
}
