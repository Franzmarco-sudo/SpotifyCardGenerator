interface Props {
  value: string
  onChange: (hex: string) => void
  presets?: string[]
  label?: string
}

const DEFAULT_PRESETS = ['#FFFFFF', '#000000', '#1DB954']

/** Preset swatches + a native colour picker (rainbow dot), like the Avalonia ColorView flyouts. */
export default function ColorField({ value, onChange, presets = DEFAULT_PRESETS, label }: Props): React.JSX.Element {
  const hex = value.toUpperCase()
  return (
    <div className="color-field" role="group" aria-label={label}>
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          className={`swatch ${hex === p.toUpperCase() ? 'active' : ''}`}
          style={{ background: p }}
          title={p}
          aria-label={`${label ?? 'Color'} ${p}`}
          onClick={() => onChange(p)}
        />
      ))}
      <span className="sep" />
      <label className="swatch custom" title="Custom colour">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </label>
      <code className="hex">{hex}</code>
    </div>
  )
}
