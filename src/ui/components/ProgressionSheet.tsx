import { useState } from 'react'
import { findExercise } from '../../data/exercises.ts'
import { setProgressionTable } from '../../db/programs.ts'
import { defaultTable, increaseFor, type ProgressionTable } from '../../engine/progression.ts'
import { Stepper } from './forms.tsx'
import { Sheet } from './Sheet.tsx'

// nSuns' rep brackets for the 1+ set. Tables are edited in these, whatever
// shape they were stored in.
const BRACKETS = [
  { minReps: 0, label: '0–1 reps' },
  { minReps: 2, label: '2–3 reps' },
  { minReps: 4, label: '4–5 reps' },
  { minReps: 6, label: '6+ reps' },
]

const steps = (table: ProgressionTable) => BRACKETS.map((b) => increaseFor(b.minReps, table))

/** How much each TM goes up at Start Week, by the reps on its ★ set. Per person, per lift. */
export function ProgressionSheet(props: {
  profileId: string
  lifts: string[]
  tables: Readonly<Record<string, ProgressionTable>>
  onClose: () => void
}) {
  const [open, setOpen] = useState(props.lifts[0])
  const [error, setError] = useState<string>()

  const save = (exerciseId: string, table: ProgressionTable | undefined) => {
    setError(undefined)
    setProgressionTable(props.profileId, exerciseId, table).catch((e: unknown) => setError((e as Error).message))
  }

  return (
    <Sheet title="TM increases" onClose={props.onClose}>
      <p className="muted small">
        How much a TM goes up at Start Week, by the reps on its ★ set. Two weeks running at 0–1 reps still counts as a
        stall.
      </p>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {props.lifts.map((id) => {
          const exercise = findExercise(id)
          const usual = defaultTable(exercise?.region ?? 'upper')
          const current = steps(props.tables[id] ?? usual)
          const changed = props.tables[id] !== undefined
          const isOpen = open === id
          return (
            <li key={id} className="prog-lift">
              <button type="button" className="pick-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : id)}>
                <span className="grow stack">
                  <span>{exercise?.name ?? id}</span>
                  <span className="muted small">
                    {current.map((n) => `+${n}`).join(' / ')}
                    {changed ? ' · changed' : ''}
                  </span>
                </span>
                <span className="chevron" aria-hidden="true">
                  {isOpen ? '▾' : '▸'}
                </span>
              </button>
              {isOpen && (
                <>
                  <div className="counts counts-spaced">
                    {BRACKETS.map((b, i) => (
                      <Stepper
                        key={b.minReps}
                        label={b.label}
                        value={current[i]!}
                        min={0}
                        max={50}
                        step={5}
                        format={(n) => `+${n}`}
                        onChange={(n) => {
                          const next = current.map((v, j) => (j === i ? n : v))
                          const same = next.every((v, j) => v === steps(usual)[j])
                          save(id, same ? undefined : BRACKETS.map((x, j) => ({ minReps: x.minReps, increase: next[j]! })))
                        }}
                      />
                    ))}
                  </div>
                  {changed && (
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => save(id, undefined)}>
                      Back to the usual
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
