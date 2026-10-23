import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { db, type ProfileRow } from '../../db/db.ts'
import { activeSession, startSession } from '../../db/sessions.ts'
import { loadWeekOverview, type WeekOverview } from '../../db/weeks.ts'
import { BackLink } from '../components/forms.tsx'

export function StartWorkout() {
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray())
      .filter((p) => !p.archived)
      .sort((a, b) => a.createdAt - b.createdAt)
    const overviews: Record<string, WeekOverview> = {}
    for (const p of profiles) overviews[p.id] = await loadWeekOverview(p.id)
    const last = (await db.sessions.toArray()).sort((a, b) => b.startedAt - a.startedAt)[0]
    return { profiles, overviews, lastGroup: last?.participants ?? [], active: await activeSession() }
  }, [])
  if (!data) return null

  if (data.active) {
    return (
      <>
        <h1>Start workout</h1>
        <p className="muted">A workout is already going.</p>
        <Link to="/session" className="btn btn-big">
          Resume it
        </Link>
      </>
    )
  }
  return <Picker {...data} />
}

function Picker(props: { profiles: ProfileRow[]; overviews: Record<string, WeekOverview>; lastGroup: string[] }) {
  const navigate = useNavigate()
  const { profiles, overviews } = props
  const ready = (id: string) => {
    const o = overviews[id]
    return Boolean(o?.program && !o.complete && o.pending.length > 0)
  }
  // Same group as last time, as long as they can train today.
  const [selected, setSelected] = useState<string[]>(() => {
    const again = props.lastGroup.filter(ready)
    return again.length ? again : profiles.filter((p) => ready(p.id)).slice(0, 1).map((p) => p.id)
  })
  const [days, setDays] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()
  const [starting, setStarting] = useState(false)

  const dayFor = (id: string) => days[id] ?? overviews[id]?.pending[0]?.id
  const chosen = profiles.filter((p) => selected.includes(p.id))
  const dayNames = new Set(
    chosen.map((p) => overviews[p.id]?.program?.days.find((d) => d.id === dayFor(p.id))?.name),
  )

  async function start() {
    setError(undefined)
    setStarting(true)
    try {
      await startSession(chosen.map((p) => ({ profileId: p.id, dayId: dayFor(p.id)! })))
      navigate('/session', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  return (
    <>
      <BackLink to="/" label="Home" />
      <h1>Start workout</h1>
      <section className="card">
        <h2>Who's training?</h2>
        {profiles.map((p) => {
          const o = overviews[p.id]
          const on = selected.includes(p.id)
          const weekNumber = o?.week?.number ?? 1
          return (
            <div key={p.id} className="person-row">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                className={on ? 'chip chip-on person-chip' : 'chip person-chip'}
                disabled={!ready(p.id)}
                onClick={() => setSelected(on ? selected.filter((id) => id !== p.id) : [...selected, p.id])}
              >
                <span className="dot" style={{ background: p.color }} />
                {p.name}
              </button>
              {o?.complete ? (
                <Link to={`/start-week?ids=${p.id}`} className="small">
                  Week {weekNumber} done · start Week {weekNumber + 1}
                </Link>
              ) : on && o ? (
                <select
                  className="input select"
                  aria-label={`${p.name}'s day`}
                  value={dayFor(p.id)}
                  onChange={(e) => setDays({ ...days, [p.id]: e.target.value })}
                >
                  {o.pending.map((d, i) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {i === 0 ? ' (next)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted small">
                  Week {weekNumber} · next {o?.pending[0]?.name ?? '—'}
                </span>
              )}
            </div>
          )
        })}
      </section>

      {dayNames.size > 1 && (
        <p className="muted small">Not everyone is on the same day. That's fine: each person runs their own.</p>
      )}
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-big" disabled={chosen.length === 0 || starting} onClick={() => void start()}>
        Start
      </button>
    </>
  )
}
