import { useState } from 'react'
import { Sheet } from './Sheet.tsx'

const RPES = [6, 7, 8, 9, 10] as const

export interface SetValues {
  weight: number
  reps: number
  rpe?: number
  note?: string
}

/** Logs a set with changes, or edits one already logged. */
export function SetEditor(props: {
  title: string
  target: string
  weight?: number
  reps: number
  rpe?: number
  note?: string
  weightStep: number
  /** Bodyweight work logs added weight, usually 0. */
  bodyweight: boolean
  seconds: boolean
  saveLabel: string
  onSave: (values: SetValues) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [weightText, setWeightText] = useState(
    props.weight !== undefined ? String(props.weight) : props.bodyweight ? '0' : '',
  )
  const [reps, setReps] = useState(props.reps)
  const [rpe, setRpe] = useState(props.rpe)
  const [note, setNote] = useState(props.note ?? '')

  const weight = weightText.trim() === '' ? undefined : Number(weightText)
  const valid = weight !== undefined && Number.isFinite(weight) && weight >= 0 && reps >= 0
  // Updater form throughout: two quick taps must count as two.
  const bump = (by: number) =>
    setWeightText((text) => String(Math.max(0, (text.trim() === '' ? 0 : Number(text) || 0) + by)))
  const repStep = props.seconds ? 5 : 1

  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <p className="muted small no-margin">Target: {props.target}</p>

      <div className="stepper">
        <span className="label">{props.bodyweight ? 'Added weight (lb)' : 'Weight (lb)'}</span>
        <div className="stepper-row">
          <button type="button" className="btn btn-quiet step" onClick={() => bump(-props.weightStep)}>
            −
          </button>
          <input
            className="input stepper-value"
            inputMode="decimal"
            aria-label="Weight"
            value={weightText}
            placeholder="lb"
            onChange={(e) => setWeightText(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <button type="button" className="btn btn-quiet step" onClick={() => bump(props.weightStep)}>
            +
          </button>
        </div>
      </div>

      <div className="stepper">
        <span className="label">{props.seconds ? 'Seconds' : 'Reps'}</span>
        <div className="stepper-row">
          <button type="button" className="btn btn-quiet step" onClick={() => setReps((r) => Math.max(0, r - repStep))}>
            −
          </button>
          <output className="stepper-value stepper-number">{reps}</output>
          <button type="button" className="btn btn-quiet step" onClick={() => setReps((r) => r + repStep)}>
            +
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">RPE</span>
        <div className="chips">
          <button type="button" className={rpe === undefined ? 'chip chip-on' : 'chip'} onClick={() => setRpe(undefined)}>
            –
          </button>
          {RPES.map((r) => (
            <button key={r} type="button" className={rpe === r ? 'chip chip-on' : 'chip'} onClick={() => setRpe(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="set-note">
          Note
        </label>
        <input id="set-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="actions">
        <button
          type="button"
          className="btn grow"
          disabled={!valid}
          onClick={() => valid && props.onSave({ weight, reps, rpe, note: note.trim() || undefined })}
        >
          {props.saveLabel}
        </button>
        {props.onDelete && (
          <button type="button" className="btn btn-danger" onClick={props.onDelete}>
            Delete
          </button>
        )}
      </div>
    </Sheet>
  )
}

/** One tap per answer: tap the number of reps and it's logged. */
export function RepPicker(props: {
  title: string
  target: string
  low: number
  high?: number
  /** The most reps offered. A missed set only needs up to the target. */
  max?: number
  onPick: (reps: number) => void
  onClose: () => void
}) {
  const max = props.max ?? Math.max(20, (props.high ?? props.low) + 5)
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <p className="muted small no-margin">Target: {props.target}. Tap the reps you got.</p>
      <div className="rep-grid">
        {Array.from({ length: max + 1 }, (_, reps) => {
          const inTarget = reps >= props.low && reps <= (props.high ?? Infinity)
          return (
            <button
              key={reps}
              type="button"
              className={inTarget ? 'rep rep-target' : 'rep'}
              onClick={() => props.onPick(reps)}
            >
              {reps}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
