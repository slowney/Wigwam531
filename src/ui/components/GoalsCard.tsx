import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { findExercise } from '../../data/exercises.ts'
import { loadGoals, setGoal, type GoalRow } from '../../db/goals.ts'
import type { Eta, GoalForecast } from '../../engine/goals.ts'
import { parseLb } from './forms.tsx'

const nameOf = (id: string) => findExercise(id)?.name ?? id

/** "~14 weeks · Feb 2027" */
function etaText(eta: Eta): string {
  const weeks = Math.max(1, Math.round(eta.days / 7))
  const when = new Date(eta.at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return `~${weeks} ${weeks === 1 ? 'week' : 'weeks'} · ${when}`
}

function paceText(f: GoalForecast): string {
  if (f.pace === undefined) return 'needs a month of TM history'
  if (f.pace === 'stalled') return "the TM hasn't gone up lately"
  return etaText(f.pace)
}

/** Target e1RMs for the big lifts, how far along each is, and when it might get there. */
export function GoalsCard(props: { profileId: string }) {
  const rows = useLiveQuery(() => loadGoals(props.profileId), [props.profileId])
  if (!rows || rows.length === 0) return null
  return (
    <section className="card">
      <h2>Goals</h2>
      {rows.map((row) => (
        <GoalItem key={row.exerciseId} profileId={props.profileId} row={row} />
      ))}
      <p className="muted small no-margin">
        Targets are e1RMs. "On plan" is the program's own progression, deloads included; "at your pace" is how the TM
        has moved over the last 12 weeks. Gains slow down, so later dates are likely optimistic.
      </p>
    </section>
  )
}

function GoalItem(props: { profileId: string; row: GoalRow }) {
  const { exerciseId, forecast: f } = props.row
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const name = nameOf(exerciseId)

  const save = (lb: number | undefined) =>
    setGoal(props.profileId, exerciseId, lb).then(
      () => setEditing(false),
      (e: unknown) => setError((e as Error).message),
    )

  if (editing) {
    return (
      <div className="goal">
        <div className="row">
          <span className="grow">{name}</span>
          <input
            className="input input-number"
            inputMode="decimal"
            autoFocus
            value={text}
            aria-label={`${name} goal e1RM`}
            onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn btn-small grow" disabled={parseLb(text) === undefined} onClick={() => void save(parseLb(text))}>
            Save
          </button>
          {f && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => void save(undefined)}>
              Clear
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const open = () => {
    setText(f ? String(f.target) : '')
    setError(undefined)
    setEditing(true)
  }

  if (!f) {
    return (
      <div className="goal">
        <div className="row">
          <span className="grow">{name}</span>
          <button type="button" className="btn btn-quiet btn-small" onClick={open}>
            Set a goal
          </button>
        </div>
      </div>
    )
  }

  const share = f.current !== undefined ? Math.min(1, f.current / f.target) : 0
  return (
    <div className="goal">
      <div className="row">
        <span className="grow">
          <strong>{name}</strong>{' '}
          <span className="muted small num">
            {f.current !== undefined ? `${Math.round(f.current)} → ` : ''}
            {f.target}
          </span>
        </span>
        <button type="button" className="btn btn-quiet btn-small" onClick={open}>
          Edit
        </button>
      </div>
      <span className="target-track goal-track" aria-hidden="true">
        <span className="target-fill" style={{ width: `${share * 100}%` }} />
      </span>
      {f.reached ? (
        <p className="small no-margin">Reached. Time for a new one.</p>
      ) : f.current === undefined ? (
        <p className="muted small no-margin">Nothing logged yet to estimate from.</p>
      ) : (
        <dl className="stat-grid small goal-etas">
          <dt>On plan</dt>
          <dd>{f.plan ? etaText(f.plan) : "the program doesn't move this TM"}</dd>
          <dt>At your pace</dt>
          <dd>{paceText(f)}</dd>
        </dl>
      )}
      {f.currentFrom === 'tm' && !f.reached && (
        <p className="muted small no-margin">Nothing heavy logged lately, so this starts from the TM.</p>
      )}
    </div>
  )
}
