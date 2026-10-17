import { useCallback, useEffect, useState } from 'react'
import Toast from './components/Toast'
import ConnectScreen from './features/connection/ConnectScreen'
import EditorScreen from './features/editor/EditorScreen'
import { useNfc } from './stores/nfc'
import { useSettings } from './stores/settings'

type Screen = { name: 'connect'; waitForRemoval: boolean } | { name: 'editor'; readerName: string }

const isWindows = navigator.userAgent.includes('Windows')

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'connect', waitForRemoval: false })
  const initNfc = useNfc((s) => s.init)
  const nfcReady = useNfc((s) => s.ready)
  const loadSettings = useSettings((s) => s.load)
  const settingsLoaded = useSettings((s) => s.loaded)

  useEffect(() => {
    let off: (() => void) | undefined
    void initNfc().then((fn) => (off = fn))
    void loadSettings()
    return () => off?.()
  }, [initNfc, loadSettings])

  const proceed = useCallback((readerName: string) => setScreen({ name: 'editor', readerName }), [])
  const clearWait = useCallback(() => setScreen({ name: 'connect', waitForRemoval: false }), [])
  const exitToMenu = useCallback(() => {
    // Returning with the card still on the reader must not bounce straight back into the editor.
    const present = useNfc.getState().state.cardPresent
    setScreen({ name: 'connect', waitForRemoval: present })
  }, [])

  return (
    <div className="app">
      {isWindows && <div className="titlebar">Spotify Card Generator</div>}
      <div className="screen">
        {nfcReady && settingsLoaded && (
          screen.name === 'connect' ? (
            <ConnectScreen waitForRemoval={screen.waitForRemoval} onCardRemoved={clearWait} onProceed={proceed} />
          ) : (
            <EditorScreen onExit={exitToMenu} />
          )
        )}
      </div>
      <Toast />
    </div>
  )
}
