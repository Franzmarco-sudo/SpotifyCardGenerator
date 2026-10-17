import { useState } from 'react'
import ColorField from '@renderer/components/ColorField'
import { useSettings } from '@renderer/stores/settings'
import type { CardType } from '@shared/types'
import type { useNfcActions } from '../nfc/useNfcActions'
import { DEFAULT_FONT, MAX_SONGS, type CardEditor } from './cardEditor'
import { useFonts } from './useFonts'

interface Props {
  editor: CardEditor | null
  url: string
  onUrl: (v: string) => void
  qrSize: number
  onQrSize: (n: number) => void
  onAddImage: () => void
  onAddText: () => void
  onOpenLayers: () => void
  onExport: () => void
  onHelp: () => void
  onExit: () => void
  nfc: ReturnType<typeof useNfcActions>
}

const TEXT_SIZES = [12, 16, 24, 32, 48, 64, 96, 128]
const FRONT_SIZES = [12, 18, 24, 32, 48]
const BACK_SIZES = [12, 14, 16, 18]

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }): React.JSX.Element {
  return (
    <section className={`card-box ${accent ? 'accent-box' : ''}`}>
      <h3 className={accent ? 'accent' : ''}>{title}</h3>
      {children}
    </section>
  )
}

export default function Sidebar(p: Props): React.JSX.Element {
  const { editor } = p
  const settings = useSettings((s) => s.settings)
  const patch = useSettings((s) => s.patch)
  const fonts = useFonts()
  const [advanced, setAdvanced] = useState(false)

  const sel = editor?.getSelection() ?? null
  const title = editor?.getTitleStyle() ?? { color: '#000000', size: 32 }
  const track = editor?.getTrackStyle() ?? { color: '#000000', size: 12 }
  const songs = editor?.getSongs() ?? { titles: [], count: 3 }
  const backTemplate = editor?.getBackTemplate() ?? 0

  return (
    <aside className="sidebar">
      <div className="brand">
        <span>Spotify NFC Generator</span>
        <button className="round-btn" onClick={p.onHelp} title="Keyboard Shortcuts" aria-label="Keyboard shortcuts">?</button>
      </div>

      <Card title="DATA SOURCE">
        <input
          type="text"
          className="text-input"
          placeholder="Spotify URI / Link"
          value={p.url}
          onChange={(e) => p.onUrl(e.target.value)}
          spellCheck={false}
        />
      </Card>

      <Card title="BACKGROUND COLORS">
        <div className="two-col">
          <div>
            <div className="label">Front Base</div>
            <ColorField label="Front background" value={settings.frontColor} onChange={(c) => patch({ frontColor: c })} />
          </div>
          <div>
            <div className="label">Back Base</div>
            <ColorField label="Back background" value={settings.backColor} onChange={(c) => patch({ backColor: c })} />
          </div>
        </div>
      </Card>

      <Card title="QR STYLE">
        <div className="row">
          <span className="label w60">Color</span>
          <ColorField label="QR color" value={settings.qrColor} onChange={(c) => patch({ qrColor: c })} presets={['#000000', '#FFFFFF', '#1DB954']} />
        </div>
        <div className="row">
          <span className="label w60">Size</span>
          <input type="range" min={50} max={250} value={p.qrSize} onChange={(e) => p.onQrSize(Number(e.target.value))} aria-label="QR size" />
          <input
            type="number"
            className="num-input"
            min={50}
            max={250}
            step={5}
            value={p.qrSize}
            onChange={(e) => p.onQrSize(Number(e.target.value))}
            aria-label="QR size in pixels"
          />
        </div>
      </Card>

      <Card title="DESIGN TOOLKIT">
        <div className="two-col tight">
          <button className="btn tool" onClick={p.onAddImage}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z" /></svg>
            Image
          </button>
          <button className="btn tool" onClick={p.onAddText}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5,4V7H10.5V19H13.5V7H19V4H5Z" /></svg>
            Text
          </button>
        </div>
        <div className="row spread">
          <button className="btn outline small" onClick={p.onOpenLayers}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" /></svg>
            Layers Manager
          </button>
          <label className="switch-row" title="Lock aspect ratio when resizing">
            <span className="label">Link Ratio</span>
            <input type="checkbox" className="switch" checked={settings.linkRatio} onChange={(e) => patch({ linkRatio: e.target.checked })} />
          </label>
        </div>
        <hr />
        <button className="btn export" onClick={p.onExport}>EXPORT PROJECT</button>
      </Card>

      {sel?.isText && (
        <Card title="SELECTED TEXT PROPERTIES" accent>
          <div className="label">Edit Content:</div>
          <input
            type="text"
            className="text-input dark"
            placeholder="Type text here..."
            value={sel.text}
            onChange={(e) => editor?.updateSelectedText({ text: e.target.value })}
          />
          <div className="label">Font Family:</div>
          <select
            className="select dark"
            value={fonts.includes(sel.fontFamily) ? sel.fontFamily : DEFAULT_FONT}
            onChange={(e) => editor?.updateSelectedText({ fontFamily: e.target.value })}
          >
            <option value={DEFAULT_FONT}>Default (Segoe UI)</option>
            {fonts.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
            ))}
          </select>
          <div className="two-col tight">
            <div>
              <div className="label">Size:</div>
              <input
                className="select dark"
                list="text-sizes"
                type="number"
                min={4}
                max={400}
                value={Math.round(sel.fontSize)}
                onChange={(e) => editor?.updateSelectedText({ fontSize: Number(e.target.value) })}
              />
              <datalist id="text-sizes">
                {TEXT_SIZES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <div className="label">Color:</div>
              <ColorField label="Text color" value={/^#[0-9a-f]{6}$/i.test(sel.fill) ? sel.fill : '#000000'} onChange={(c) => editor?.updateSelectedText({ fill: c })} presets={['#000000', '#FFFFFF']} />
            </div>
          </div>
          <div className="three-col">
            <button className={`btn small ${sel.bold ? 'on' : ''}`} style={{ fontWeight: 700 }} onClick={() => editor?.updateSelectedText({ bold: !sel.bold })} aria-pressed={sel.bold}>B</button>
            <button className={`btn small ${sel.italic ? 'on' : ''}`} style={{ fontStyle: 'italic' }} onClick={() => editor?.updateSelectedText({ italic: !sel.italic })} aria-pressed={sel.italic}>I</button>
            <button className="btn small delete" onClick={() => editor?.deleteSelected()} disabled={!sel.deletable} title={sel.deletable ? 'Delete layer' : 'Part of the template'} aria-label="Delete layer">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
            </button>
          </div>
        </Card>
      )}

      <Card title="GLOBAL TEXT CONFIG">
        <div className="label green">Front Title Style</div>
        <div className="row">
          <ColorField label="Title color" value={title.color} onChange={(c) => editor?.setTitleStyle({ color: c })} presets={['#000000', '#FFFFFF']} />
          <select className="select dark w100" value={title.size} onChange={(e) => editor?.setTitleStyle({ size: Number(e.target.value) })} aria-label="Title size">
            {FRONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            {!FRONT_SIZES.includes(title.size) && <option value={title.size}>{title.size}</option>}
          </select>
        </div>

        {backTemplate === 1 && (
          <>
            <div className="label green top">Tracklist Style</div>
            <div className="row">
              <ColorField label="Tracklist color" value={track.color} onChange={(c) => editor?.setTrackStyle({ color: c })} presets={['#000000', '#FFFFFF']} />
              <select className="select dark w100" value={track.size} onChange={(e) => editor?.setTrackStyle({ size: Number(e.target.value) })} aria-label="Tracklist size">
                {BACK_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="songs">
              {Array.from({ length: songs.count }, (_, i) => (
                <input
                  key={i}
                  type="text"
                  className="text-input"
                  placeholder={`Song #${i + 1}`}
                  value={songs.titles[i] ?? ''}
                  onChange={(e) => {
                    const next = [...songs.titles]
                    next[i] = e.target.value
                    editor?.setSongs(next, songs.count)
                  }}
                />
              ))}
            </div>
            <button className="btn full" disabled={songs.count >= MAX_SONGS} onClick={() => editor?.setSongs(songs.titles, songs.count + 1)}>
              + Add Song
            </button>
          </>
        )}
      </Card>

      <Card title="NFC OPERATIONS">
        <div className="row spread">
          <span />
          <label className="switch-row">
            <span className="label">Auto Open</span>
            <input type="checkbox" className="switch" checked={settings.autoOpen} onChange={(e) => patch({ autoOpen: e.target.checked })} />
          </label>
        </div>

        <div className="label">Target Card Type</div>
        <select
          className="select dark"
          value={settings.cardType}
          onChange={(e) => patch({ cardType: e.target.value as CardType })}
          aria-label="Target card type"
        >
          <option value="ntag215">NTAG215 (Recommended)</option>
          <option value="mifare1k">MIFARE Classic 1K</option>
        </select>

        <div className={`indicator ${p.nfc.indicator.ok ? 'ok' : 'bad'}`} role="status">
          <span className="dot" />
          {p.nfc.indicator.text}
        </div>

        <div className="label">Last Scanned Data</div>
        <input className="text-input terminal" readOnly value={p.nfc.readOutput} placeholder="// Waiting for scan..." />
        <div className={`status-text ${p.nfc.status.tone}`}>{p.nfc.status.text}</div>

        <div className="label caps">BASIC CONTROLS</div>
        <div className="two-col tight">
          <button className="btn tool" onClick={() => void p.nfc.read()} disabled={p.nfc.busy}>READ</button>
          <button className="btn primary" onClick={() => void p.nfc.write()} disabled={p.nfc.busy}>WRITE</button>
        </div>
        <hr />
        <div className="row spread">
          <span className="label caps">ADVANCED CONTROLS</span>
          <input type="checkbox" className="switch" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} aria-label="Show advanced controls" />
        </div>
        {advanced && (
          <div className="two-col tight">
            <button className="btn danger-outline small" onClick={() => void p.nfc.lock()} disabled={p.nfc.busy}>LOCK CARD</button>
            <button className="btn small" onClick={() => void p.nfc.format()} disabled={p.nfc.busy}>FORMAT</button>
          </div>
        )}
      </Card>

      <button className="btn ghost danger exit" onClick={p.onExit}>EXIT TO MENU</button>
    </aside>
  )
}
