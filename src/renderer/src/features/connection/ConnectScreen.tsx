import { useEffect, useRef, useState } from 'react'
import { useNfc } from '@renderer/stores/nfc'
import { shouldAutoAdvance } from './advance'

interface Props {
  waitForRemoval: boolean
  onCardRemoved: () => void
  onProceed: (readerName: string) => void
}

const ICON_DOT = 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z'
const ICON_OK = 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,17L5,12L6.41,10.59L10,14.17L17.59,6.58L19,8L10,17Z'

export default function ConnectScreen({ waitForRemoval, onCardRemoved, onProceed }: Props): React.JSX.Element {
  const nfc = useNfc((s) => s.state)
  const refresh = useNfc((s) => s.refresh)
  const [redirecting, setRedirecting] = useState(false)
  const proceeded = useRef(false)

  // Once the card is taken off the reader, a future card may redirect again.
  useEffect(() => {
    if (waitForRemoval && !nfc.cardPresent) onCardRemoved()
  }, [waitForRemoval, nfc.cardPresent, onCardRemoved])

  useEffect(() => {
    if (proceeded.current || !shouldAutoAdvance(nfc, waitForRemoval)) {
      setRedirecting(false)
      return
    }
    setRedirecting(true)
    const reader = nfc.readerName!
    const t = setTimeout(() => {
      proceeded.current = true
      onProceed(reader)
    }, 800)
    return () => clearTimeout(t)
  }, [nfc, waitForRemoval, onProceed])

  let tone: 'good' | 'bad' | 'ready' = 'bad'
  let main = 'No Reader Found'
  let sub = 'Looking for device...'
  let pulsing = true
  let icon = ICON_DOT

  if (nfc.serviceError) {
    main = 'Service Error'
    sub = nfc.serviceError
    pulsing = false
  } else if (redirecting) {
    tone = 'good'
    main = 'Card Detected!'
    sub = 'Redirecting...'
    pulsing = false
    icon = ICON_OK
  } else if (nfc.readerName) {
    tone = 'ready'
    main = 'Reader Connected'
    sub = waitForRemoval && nfc.cardPresent ? 'Remove the card, then tap it again' : nfc.readerName
  }

  return (
    <div className="connect">
      <div className={`ring-wrap ${tone}`}>
        <div className={`pulse-ring ${pulsing ? 'pulse' : ''}`} />
        <div className="status-ring">
          <svg viewBox="0 0 24 24" width="60" height="60" fill="currentColor" aria-hidden="true">
            <path d={icon} />
          </svg>
        </div>
      </div>

      <div className="connect-text">
        <h1>{main}</h1>
        <p>{sub}</p>
      </div>

      <div className="connect-actions">
        {!nfc.readerName && (
          <button className="btn pill" onClick={() => void refresh()}>
            Retry Connection
          </button>
        )}
        <button className="btn ghost" onClick={() => onProceed('')}>
          Skip / Design Only
        </button>
      </div>
    </div>
  )
}
