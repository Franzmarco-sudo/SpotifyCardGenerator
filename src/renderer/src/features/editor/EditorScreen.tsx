import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '@renderer/stores/settings'
import ExportDialog from '../export/ExportDialog'
import { useNfcActions } from '../nfc/useNfcActions'
import {
  CARD_H,
  CARD_W,
  CardEditor,
  pickImageFile,
  type BackTemplate,
  type FrontTemplate,
  type Side
} from './cardEditor'
import LayersPanel from './LayersPanel'
import { HelpOverlay, SideChooser } from './Overlays'
import Sidebar from './Sidebar'
import TemplateDialog from './TemplateDialog'

type Overlay =
  | null
  | { type: 'side'; action: 'image' | 'text' }
  | { type: 'help' }
  | { type: 'export' }
  | { type: 'template'; side: Side }

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

export default function EditorScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const patch = useSettings((s) => s.patch)

  const [, setRev] = useState(0) // bumped whenever the editor reports a change
  const [editor, setEditor] = useState<CardEditor | null>(null)
  const [url, setUrl] = useState('')
  const [qrSize, setQrSize] = useState(settings.qrSize)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>(null)

  const frontRef = useRef<HTMLCanvasElement>(null)
  const backRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const urlRef = useRef(url)
  urlRef.current = url

  const nfc = useNfcActions(useCallback(() => urlRef.current, []))
  const nfcRef = useRef(nfc)
  nfcRef.current = nfc

  // ---- create / destroy the Fabric editor once
  useEffect(() => {
    if (!frontRef.current || !backRef.current) return
    const s = useSettings.getState().settings
    const ed = new CardEditor(frontRef.current, backRef.current, {
      onChange: () => setRev((r) => r + 1),
      onQrSize: setQrSize
    })
    ed.setCardColor('front', s.frontColor)
    ed.setCardColor('back', s.backColor)
    ed.setLinkRatio(s.linkRatio)
    ed.setQrColor(s.qrColor)
    setEditor(ed)
    void ed.init(s.qrSize)
    return () => {
      void ed.dispose()
    }
  }, [])

  // ---- keep the editor in sync with settings / inputs
  useEffect(() => editor?.setCardColor('front', settings.frontColor), [editor, settings.frontColor])
  useEffect(() => editor?.setCardColor('back', settings.backColor), [editor, settings.backColor])
  useEffect(() => editor?.setQrColor(settings.qrColor), [editor, settings.qrColor])
  useEffect(() => editor?.setLinkRatio(settings.linkRatio), [editor, settings.linkRatio])
  useEffect(() => editor?.setQrUrl(url), [editor, url])

  // ---- fit the cards into the stage (the Avalonia "Viewbox")
  useEffect(() => {
    const el = stageRef.current
    if (!el || !editor) return
    const apply = (): void => {
      const { width, height } = el.getBoundingClientRect()
      const s = Math.min((width - 80) / (CARD_W * 2 + 70), (height - 200) / (CARD_H + 70))
      editor.setScale(clamp(s, 0.5, 2.4))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [editor, sidebarOpen])

  // ---- keyboard shortcuts (Ctrl+W write, Ctrl+R read, Ctrl+S export, Delete)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return
      if (e.key === 'Escape') {
        setOverlay(null)
        return
      }
      if (e.key === 'Delete') {
        editor?.deleteSelected()
        e.preventDefault()
        return
      }
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase()
        if (key === 'w') void nfcRef.current.write()
        else if (key === 'r') void nfcRef.current.read()
        else if (key === 's') setOverlay({ type: 'export' })
        else return
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  const changeQrSize = (n: number): void => {
    const v = clamp(Math.round(Number.isFinite(n) ? n : 120), 50, 250)
    setQrSize(v)
    editor?.setQrSize(v)
    patch({ qrSize: v })
  }

  const pickSide = async (side: Side): Promise<void> => {
    const o = overlay
    setOverlay(null)
    if (!editor || o?.type !== 'side') return
    if (o.action === 'text') editor.addText(side)
    else {
      const file = await pickImageFile()
      if (file) await editor.addImage(side, file)
    }
  }

  const selectTemplate = (side: Side, index: number): void => {
    if (side === 'front') editor?.setFrontTemplate(index as FrontTemplate)
    else editor?.setBackTemplate(index as BackTemplate)
    setOverlay(null)
  }

  return (
    <div className="editor">
      {sidebarOpen && (
        <Sidebar
          editor={editor}
          url={url}
          onUrl={setUrl}
          qrSize={qrSize}
          onQrSize={changeQrSize}
          onAddImage={() => setOverlay({ type: 'side', action: 'image' })}
          onAddText={() => setOverlay({ type: 'side', action: 'text' })}
          onOpenLayers={() => setLayersOpen(true)}
          onExport={() => setOverlay({ type: 'export' })}
          onHelp={() => setOverlay({ type: 'help' })}
          onExit={onExit}
          nfc={nfc}
        />
      )}

      <main className="stage" ref={stageRef}>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? '‹' : '›'}
        </button>

        <header className="stage-head">
          <h2>LIVE PREVIEW</h2>
          <p>What you see is what gets printed</p>
        </header>

        <div className="cards">
          <div className="card-col">
            <div className="side-label">FRONT SIDE</div>
            <div className="card-shadow">
              <div className="canvas-host"><canvas ref={frontRef} /></div>
            </div>
            <button className="btn pill small" onClick={() => setOverlay({ type: 'template', side: 'front' })}>
              Toggle Title
            </button>
          </div>

          <div className="card-col">
            <div className="side-label">BACK SIDE</div>
            <div className="card-shadow">
              <div className="canvas-host"><canvas ref={backRef} /></div>
            </div>
            <button className="btn pill small" onClick={() => setOverlay({ type: 'template', side: 'back' })}>
              Switch Back Template
            </button>
          </div>
        </div>

        {layersOpen && editor && <LayersPanel editor={editor} onClose={() => setLayersOpen(false)} />}
      </main>

      {overlay?.type === 'side' && <SideChooser onPick={(s) => void pickSide(s)} onCancel={() => setOverlay(null)} />}
      {overlay?.type === 'help' && <HelpOverlay onClose={() => setOverlay(null)} />}
      {overlay?.type === 'template' && editor && (
        <TemplateDialog
          side={overlay.side}
          current={overlay.side === 'front' ? editor.getFrontTemplate() : editor.getBackTemplate()}
          onSelect={(i) => selectTemplate(overlay.side, i)}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.type === 'export' && editor && <ExportDialog editor={editor} onClose={() => setOverlay(null)} />}
    </div>
  )
}
