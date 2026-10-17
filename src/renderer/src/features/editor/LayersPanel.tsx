import { useState } from 'react'
import type { CardEditor, Side } from './cardEditor'

interface Props {
  editor: CardEditor
  onClose: () => void
}

export default function LayersPanel({ editor, onClose }: Props): React.JSX.Element {
  const [side, setSide] = useState<Side>('front')
  const layers = editor.getLayers(side)
  const selected = layers.find((l) => l.selected)

  return (
    <div className="layers-panel" role="dialog" aria-label="Layers">
      <div className="layers-head">
        <strong>LAYERS</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close layers">×</button>
      </div>

      <div className="tabs" role="tablist">
        {(['front', 'back'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={side === s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>
            {s === 'front' ? 'Front' : 'Back'}
          </button>
        ))}
      </div>

      <ul className="layer-list">
        {layers.length === 0 && <li className="empty">No layers</li>}
        {layers.map((l) => (
          <li key={l.index}>
            <button className={l.selected ? 'active' : ''} onClick={() => editor.selectLayer(side, l.index)} title={l.name}>
              <span className="kind">{l.kind === 'qr' ? 'QR' : l.kind === 'image' || l.kind === 'gridImage' ? 'IMG' : 'T'}</span>
              <span className="name">{l.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="layer-actions">
        <button className="btn small" disabled={!selected} onClick={() => editor.moveSelected(1)} title="Bring forward" aria-label="Bring forward">▲</button>
        <button className="btn small" disabled={!selected} onClick={() => editor.moveSelected(-1)} title="Send backward" aria-label="Send backward">▼</button>
        <button className="btn small delete" disabled={!selected?.deletable} onClick={() => editor.deleteSelected()} title="Delete layer" aria-label="Delete layer">Delete</button>
      </div>
    </div>
  )
}
