import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { db } from '../../db/db.ts'
import { loadProgram } from '../../db/profiles.ts'
import { dayLabel, type Program } from '../../engine/program.ts'
import { formatDate } from '../format.ts'

const SHOWN = 15

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * Finished workouts, newest first. Each opens its summary, which is also
 * where one can be reopened or deleted.
 */
function Workouts() {
  const [all, setAll] = useState(false)
  const data = useLiveQuery(async () => {
    const sessions = (await db.sessions.where('status').equals('done').toArray()).sort((a, b) => b.startedAt - a.startedAt)
    const profiles = new Map((await db.profiles.toArray()).map((p) => [p.id, p]))
    const programs = new Map<string, Program | undefined>()
    const rows = []
    for (const session of all ? sessions : sessions.slice(0, SHOWN)) {
      const people = []
      for (const entry of await db.entries.where('sessionId').equals(session.id).toArray()) {
        if (!programs.has(entry.profileId)) programs.set(entry.profileId, await loadProgram(entry.profileId))
        const day = programs.get(entry.profileId)?.days.find((d) => d.id === entry.dayId)
        const profile = profiles.get(entry.profileId)
        people.push({
          id: entry.id,
          name: profile?.name ?? 'Someone',
          color: profile?.color ?? 'var(--muted)',
          // A day since removed from the program, or a program since switched, has no label to show.
          day: day ? dayLabel(day, findExercise) : 'a day no longer in the program',
          empty: entry.status === 'empty',
        })
      }
      rows.push({ session, people })
    }
    return { rows, total: sessions.length }
  }, [all])
  if (!data) return null

  return (
    <section>
      <h2>Workouts</h2>
      {data.total === 0 && <p className="muted">None finished yet.</p>}
      {data.rows.length > 0 && (
        <ul className="list card">
          {data.rows.map(({ session, people }) => (
            <li key={session.id}>
              <Link to={`/sessions/${session.id}`} className="list-row workout-row">
                <span className="grow stack">
                  <strong>
                    {formatDate(session.startedAt)} <span className="muted small">{clock(session.startedAt)}</span>
                  </strong>
                  {people.map((p) => (
                    <span key={p.id} className="muted small workout-person">
                      <span className="dot dot-small" style={{ background: p.color }} />
                      {p.name}: {p.day}
                      {p.empty ? ' (nothing logged)' : ''}
                    </span>
                  ))}
                </span>
                <span className="chev">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!all && data.total > SHOWN && (
        <button type="button" className="btn btn-quiet btn-wide" onClick={() => setAll(true)}>
          Show all {data.total}
        </button>
      )}
    </section>
  )
}

export function Progress() {
  return (
    <>
      <h1>Progress</h1>
      <p className="muted">Charts and the PR board arrive in Phase 6.</p>
      <Workouts />
    </>
  )
}
