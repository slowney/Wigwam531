import { useState } from 'react'
import { findExercise } from '../../data/exercises.ts'
import { findScheme } from '../../data/schemes.ts'
import type { Tier } from '../../engine/program.ts'
import { changeExercise, type SlotFields } from '../../engine/programEdit.ts'
import type { Scheme } from '../../engine/schemes.ts'
import { schemeSummary } from '../format.ts'
import { ExercisePicker } from './ExercisePicker.tsx'
import { ConfirmButton, Segmented } from './forms.tsx'
import { SchemeEditor, SchemePicker, useCustomSchemeIds } from './SchemeSheets.tsx'
import { Sheet } from './Sheet.tsx'

const TIERS: ReadonlyArray<{ value: Tier; label: string }> = [
  { value: 'T1', label: 'T1' },
  { value: 'T2', label: 'T2' },
  { value: 'T3', label: 'T3' },
]

// Offered as TM sources even before they have a TM: most percent work hangs off one of them.
const BIG_FOUR = ['bench-press', 'squat', 'overhead-press', 'deadlift']

const nameOf = (id: string) => findExercise(id)?.name ?? id

function progressionText(scheme: Scheme | undefined, tmName: string): string {
  if (!scheme) return ''
  if (scheme.kind === 'range') {
    return `Double progression: the weight goes up once every set reaches ${scheme.reps[1]} reps.`
  }
  if (scheme.cycle) {
    return `Moves the ${tmName} TM once a cycle: +5 (upper body) or +10 (lower) after the last wave week, if every 1+ set made its reps.`
  }
  if (scheme.waves?.length) {
    return `Changes week to week with the wave, and follows the ${tmName} TM as that moves.`
  }
  const star = scheme.sets.find((s) => s.progression)
  return star
    ? `The ★ set at ${star.pct}% moves the ${tmName} TM at Start Week.`
    : `Doesn't move a TM itself. It follows the ${tmName} TM as that moves.`
}

/** One main lift: what it is, its tier, how its sets run and whose TM they use. */
export function SlotSheet(props: {
  title: string
  initial: SlotFields
  /** This person's TMs. */
  tms: Readonly<Record<string, number>>
  hidden: ReadonlySet<string>
  saveLabel?: string
  note?: string
  onSave: (fields: SlotFields) => Promise<void> | void
  onClose: () => void
  /** Takes the lift out of the day. */
  onRemove?: () => Promise<void> | void
  /** Goes back to the leader's version. */
  reset?: { label: string; onReset: () => Promise<void> | void }
}) {
  const [fields, setFields] = useState(props.initial)
  const [picking, setPicking] = useState<'exercise' | 'scheme' | 'sets'>()
  const custom = useCustomSchemeIds()
  const [error, setError] = useState<string>()
  // Saving can be refused (a lift already logged today, say); the sheet stays open to say why.
  const attempt = (work: () => Promise<void> | void) => {
    setError(undefined)
    Promise.resolve()
      .then(work)
      .catch((e: unknown) => setError((e as Error).message))
  }
  const hasTm = (id: string) => props.tms[id] !== undefined
  const scheme = findScheme(fields.schemeId)
  const percent = scheme?.kind === 'percent'
  const tmId = fields.tmExerciseId ?? fields.exerciseId

  if (picking === 'exercise') {
    return (
      <ExercisePicker
        title="Choose the lift"
        hidden={props.hidden}
        onClose={() => setPicking(undefined)}
        onPick={(id) => {
          setFields(changeExercise(fields, id, hasTm, findScheme))
          setPicking(undefined)
        }}
      />
    )
  }
  if (picking === 'sets' && scheme?.kind === 'percent') {
    // A built-in scheme is never changed: this lift gets its own copy.
    const mine = custom.has(scheme.id)
    return (
      <SchemeEditor
        editing={mine ? scheme : undefined}
        from={mine ? undefined : scheme}
        onClose={() => setPicking(undefined)}
        onSaved={(schemeId) => {
          setFields({ ...fields, schemeId })
          setPicking(undefined)
        }}
      />
    )
  }
  if (picking === 'scheme') {
    return (
      <SchemePicker
        current={fields.schemeId}
        onClose={() => setPicking(undefined)}
        onPick={(schemeId) => {
          // A rep range runs off its own working weight, so a TM source would only mislead.
          const range = findScheme(schemeId)?.kind === 'range'
          setFields({ ...fields, schemeId, ...(range ? { tmExerciseId: undefined } : {}) })
          setPicking(undefined)
        }}
      />
    )
  }

  const sources = [...new Set([...BIG_FOUR, ...Object.keys(props.tms), ...(fields.tmExerciseId ? [fields.tmExerciseId] : [])])]
    .filter((id) => id !== fields.exerciseId)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const tmLabel = (id: string) => (hasTm(id) ? `TM ${props.tms[id]}` : 'no TM yet')

  return (
    <Sheet title={props.title} onClose={props.onClose}>
      {props.note && <p className="muted small">{props.note}</p>}
      <div className="field">
        <span className="label">Lift</span>
        <button type="button" className="pick-row" onClick={() => setPicking('exercise')}>
          <span className="grow">{nameOf(fields.exerciseId)}</span>
          <span className="muted small">Change</span>
        </button>
      </div>

      <div className="field">
        <span className="label">Tier</span>
        <Segmented label="Tier" value={fields.tier} onChange={(tier) => setFields({ ...fields, tier })} options={TIERS} />
      </div>

      <div className="field">
        <span className="label">Sets and reps</span>
        <button type="button" className="pick-row" onClick={() => setPicking('scheme')}>
          <span className="grow stack">
            <span>{scheme?.name ?? fields.schemeId}</span>
            {scheme && <span className="muted small">{schemeSummary(scheme)}</span>}
          </span>
          <span className="muted small">Change</span>
        </button>
        {percent && (
          <button type="button" className="btn btn-quiet btn-small edit-sets" onClick={() => setPicking('sets')}>
            Edit these sets
          </button>
        )}
      </div>

      {percent && (
        <div className="field">
          <label className="label" htmlFor="tm-source">
            Percentages of
          </label>
          <select
            id="tm-source"
            className="input"
            value={fields.tmExerciseId && fields.tmExerciseId !== fields.exerciseId ? fields.tmExerciseId : ''}
            onChange={(e) => setFields({ ...fields, tmExerciseId: e.target.value || undefined })}
          >
            <option value="">Its own TM ({tmLabel(fields.exerciseId)})</option>
            {sources.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}'s TM ({tmLabel(id)})
              </option>
            ))}
          </select>
          {!hasTm(tmId) && (
            <p className="small warn-text no-margin">
              No {nameOf(tmId)} TM yet. Set one on the profile so this lift can be planned.
            </p>
          )}
        </div>
      )}

      <label className="toggle">
        <input
          type="checkbox"
          checked={fields.warmups}
          onChange={(e) => setFields({ ...fields, warmups: e.target.checked })}
        />{' '}
        Warm-up sets before the first working set
      </label>

      <p className="muted small">{progressionText(scheme, nameOf(tmId))}</p>
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button type="button" className="btn grow" onClick={() => attempt(() => props.onSave(fields))}>
          {props.saveLabel ?? 'Save'}
        </button>
      </div>
      {(props.onRemove || props.reset) && (
        <div className="sheet-foot">
          {props.reset && (
            <button type="button" className="btn btn-quiet" onClick={() => attempt(props.reset!.onReset)}>
              {props.reset.label}
            </button>
          )}
          {props.onRemove && (
            <ConfirmButton label="Remove from the day" confirmLabel="Tap again to remove" onConfirm={() => attempt(props.onRemove!)} />
          )}
        </div>
      )}
    </Sheet>
  )
}
