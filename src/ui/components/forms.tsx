import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

export const PROFILE_COLORS = [
  { value: '#f2a33a', name: 'Amber' },
  { value: '#3cc1b0', name: 'Teal' },
  { value: '#5b9cf5', name: 'Blue' },
  { value: '#a77bf3', name: 'Purple' },
  { value: '#ef6fa8', name: 'Pink' },
  { value: '#ef6b6b', name: 'Red' },
  { value: '#6fcf6a', name: 'Green' },
  { value: '#c9ccd1', name: 'Silver' },
] as const

/** A positive number of pounds, or undefined for blank or junk input. */
export function parseLb(text: string): number | undefined {
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="back">
      ‹ {label}
    </Link>
  )
}

export function TextInput(props: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {props.label}
      </label>
      <input
        id={id}
        className="input"
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  )
}

export function WeightInput(props: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="field field-inline">
      <label htmlFor={id} className="grow">
        {props.label}
      </label>
      {props.hint && <span className="hint">{props.hint}</span>}
      <input
        id={id}
        className="input input-number"
        // inputMode, not type="number": iOS shows the decimal pad and
        // nothing turns "185" into "185.0000001".
        inputMode="decimal"
        placeholder="lb"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      />
    </div>
  )
}

export function Segmented<T extends string>(props: {
  label: string
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? 'seg seg-on' : 'seg'}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ChoiceList<T extends string>(props: {
  label: string
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; title: string; description?: string }>
}) {
  return (
    <div className="choices" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? 'choice choice-on' : 'choice'}
          onClick={() => props.onChange(o.value)}
        >
          <span className="choice-title">{o.title}</span>
          {o.description && <span className="choice-desc">{o.description}</span>}
        </button>
      ))}
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      {PROFILE_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={c.value === value}
          aria-label={c.name}
          className={c.value === value ? 'swatch swatch-on' : 'swatch'}
          style={{ background: c.value }}
          onClick={() => onChange(c.value)}
        />
      ))}
    </div>
  )
}

/**
 * Two taps instead of a dialog: the first arms it, the second does it.
 * Disarms itself after a few seconds so a stray tap later is harmless.
 */
export function ConfirmButton(props: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  small?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  const size = props.small ? ' btn-small' : ''
  return (
    <button
      type="button"
      className={(armed ? 'btn btn-danger' : 'btn btn-quiet') + size}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        props.onConfirm()
      }}
    >
      {armed ? props.confirmLabel : props.label}
    </button>
  )
}
