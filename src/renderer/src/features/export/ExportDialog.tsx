import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@renderer/stores/toast'
import type { CardEditor } from '../editor/cardEditor'
import { canvasToBytes, composeSheet } from './compose'
import { ARRANGEMENTS, PAPERS, type Arrangement, type PaperId } from './sheet'

interface Props {
  editor: CardEditor
  onClose: () => void
}

export default function ExportDialog({ editor, onClose }: Props): React.JSX.Element {
  const toast = useToast((s) => s.show)
  const [paper, setPaper] = useState<PaperId>('a4')
  const [arrangement, setArrangement] = useState<Arrangement>('single')
  const [format, setFormat] = useState<'png' | 'jpg'>('png')
  const [transparent, setTransparent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fits, setFits] = useState(true)
  const preview = useRef<HTMLCanvasElement>(null)

  // Render both sides once when the dialog opens.
  const sides = useMemo(() => ({ front: editor.renderSide('front'), back: editor.renderSide('back') }), [editor])

  const effectiveTransparent = transparent && format === 'png' // JPEG has no alpha channel

  useEffect(() => {
    if (!preview.current) return
    const layout = composeSheet(preview.current, sides.front, sides.back, { paper, arrangement, transparent: effectiveTransparent })
    setFits(layout.fits)
  }, [sides, paper, arrangement, effectiveTransparent])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const out = document.createElement('canvas')
      composeSheet(out, sides.front, sides.back, { paper, arrangement, transparent: effectiveTransparent })
      const data = await canvasToBytes(out, format)
      const path = await window.api.saveImage({ data, format, suggestedName: 'spotify-card-sheet' })
      if (path) {
        toast('Sheet exported', true)
        onClose()
      }
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`, false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay dim" role="dialog" aria-modal="true" aria-label="Export project layout">
      <div className="export-dialog">
        <aside className="export-settings">
          <h2 className="accent">EXPORT SETTINGS</h2>

          <label className="check">
            <input type="checkbox" checked={transparent} disabled={format === 'jpg'} onChange={(e) => setTransparent(e.target.checked)} />
            Transparent Background
          </label>
          {format === 'jpg' && <p className="hint">JPG can&apos;t be transparent.</p>}

          <hr />
          <label className="field">
            <span>Paper Size</span>
            <select value={paper} onChange={(e) => setPaper(e.target.value as PaperId)}>
              {Object.entries(PAPERS).map(([id, p]) => (
                <option key={id} value={id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Arrangement</span>
            <select value={arrangement} onChange={(e) => setArrangement(e.target.value as Arrangement)}>
              {Object.entries(ARRANGEMENTS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Export Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'jpg')}>
              <option value="png">PNG Image (High Res)</option>
              <option value="jpg">JPG Image</option>
            </select>
          </label>
          {!fits && <p className="warn">This layout doesn&apos;t fit on the selected paper - cards will be cut off.</p>}
          <hr />

          <button className="btn primary big" onClick={() => void save()} disabled={saving}>
            {saving ? 'EXPORTING...' : 'EXPORT SHEET'}
          </button>
          <button className="btn ghost danger" onClick={onClose}>Cancel</button>
        </aside>

        <section className="export-preview">
          <canvas ref={preview} className={effectiveTransparent ? 'checker' : ''} />
        </section>
      </div>
    </div>
  )
}
