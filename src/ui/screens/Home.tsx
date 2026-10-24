import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { db } from '../../db/db.ts'
import { activeSession } from '../../db/sessions.ts'
import { loadWeekOverview, type WeekOverview } from '../../db/weeks.ts'
import { dayLabel } from '../../engine/program.ts'
import { BackupReminder } from '../BackupPrompt.tsx'

function weekLine(o: WeekOverview | undefined): string {
  if (!o?.program) return 'No program'
  const n = o.week?.number ?? 1
  if (o.complete) return `Week ${n} done · ready for Start Week`
  const type = o.week?.type === 'deload' ? ' (deload)' : o.week?.type === 'tmTest' ? ' (TM test)' : ''
  const done = o.program.days.length - o.pending.length
  const next = o.pending[0] ? dayLabel(o.pending[0], findExercise) : '—'
  return `Week ${n}${type} · ${done} of ${o.program.days.length} done · next ${next}`
}

export function Home() {
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray())
      .filter((p) => !p.archived)
      .sort((a, b) => a.createdAt - b.createdAt)
    const overviews: Record<string, WeekOverview> = {}
    for (const p of profiles) overviews[p.id] = await loadWeekOverview(p.id)
    return { profiles, overviews, active: await activeSession() }
  }, [])
  if (!data) return null
  const { profiles, overviews, active } = data
  const finished = profiles.filter((p) => overviews[p.id]?.complete)
  const names = (ids: string[]) =>
    ids.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(', ')

  return (
    <>
      <h1>Wigwam531</h1>

      {active && (
        <Link to="/session" className="card card-live">
          <span className="grow stack">
            <strong>Workout in progress</strong>
            <span className="muted small">
              {names(active.participants)} · started{' '}
              {new Date(active.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </span>
          </span>
          <span className="btn btn-small">Resume</span>
        </Link>
      )}

      <BackupReminder />

      {profiles.length === 0 ? (
        <section className="card">
          <h2>Who trains here?</h2>
          <p className="muted">
            Add yourself first, then anyone who lifts with you. Partners can follow your program and keep their own
            numbers.
          </p>
          <Link to="/profiles/new" className="btn btn-big">
            Add a profile
          </Link>
        </section>
      ) : (
        <>
          {!active && (
            <Link to="/workout" className="btn btn-big">
              Start workout
            </Link>
          )}
          {finished.length > 0 && (
            <Link to="/start-week" className="btn btn-big btn-quiet start-week">
              Start Week for {names(finished.map((p) => p.id))}
            </Link>
          )}
          <ul className="list card">
            {profiles.map((p) => (
              <li key={p.id}>
                <Link to={`/profiles/${p.id}/week`} className="list-row">
                  <span className="dot" style={{ background: p.color }} />
                  <span className="grow stack">
                    <strong>{p.name}</strong>
                    <span className="muted small">{weekLine(overviews[p.id])}</span>
                  </span>
                  <span className="chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
