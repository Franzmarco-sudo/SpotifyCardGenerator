import type { Side } from './cardEditor'

interface Props {
  side: Side
  current: number
  onSelect: (index: number) => void
  onClose: () => void
}

const FRONT = [
  { label: 'No Title (Clean)', preview: <div className="mini blank" /> },
  { label: 'Standard Title', preview: <div className="mini"><b>TITLE</b></div> },
  { label: '2x2 Full Grid', preview: <div className="mini grid"><i /><i /><i /><i /></div> }
]
const BACK = [
  { label: 'QR Only', preview: <div className="mini center"><span className="qr" /></div> },
  { label: 'Tracklist', preview: <div className="mini split"><span className="lines" /><span className="qr small" /></div> },
  { label: 'Paragraph', preview: <div className="mini split"><small>Lorem...</small><span className="qr small" /></div> }
]

export default function TemplateDialog({ side, current, onSelect, onClose }: Props): React.JSX.Element {
  const options = side === 'front' ? FRONT : BACK
  return (
    <div className="overlay dim" role="dialog" aria-modal="true" aria-label="Choose layout" onClick={onClose}>
      <div className="dialog template-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{side === 'front' ? 'Select Front Layout' : 'Select Back Layout'}</h2>
        <div className="template-grid">
          {options.map((o, i) => (
            <button key={o.label} className={`template-option ${i === current ? 'current' : ''}`} onClick={() => onSelect(i)}>
              {o.preview}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
