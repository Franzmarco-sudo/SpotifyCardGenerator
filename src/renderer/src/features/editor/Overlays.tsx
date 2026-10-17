import type { Side } from './cardEditor'

export function SideChooser({ onPick, onCancel }: { onPick: (side: Side) => void; onCancel: () => void }): React.JSX.Element {
  return (
    <div className="overlay dim" role="dialog" aria-modal="true" aria-label="Choose card side" onClick={onCancel}>
      <div className="dialog small-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>CHOOSE CARD SIDE</h2>
        <div className="two-col">
          <button className="btn tool big" onClick={() => onPick('front')}>FRONT</button>
          <button className="btn tool big" onClick={() => onPick('back')}>BACK</button>
        </div>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + W', 'Write to Card'],
  ['Ctrl + R', 'Read Card Data'],
  ['Ctrl + S', 'Export Project Image'],
  ['Delete', 'Remove Selected Layer'],
  ['Double-click text', 'Edit text on the card'],
  ['Double-click grid image', 'Replace the image']
]

export function HelpOverlay({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="overlay dim heavy" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="dialog help-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>KEYBOARD SHORTCUTS</h2>
        <dl>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="shortcut">
              <dt><kbd>{k}</kbd></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <button className="btn primary pill" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
