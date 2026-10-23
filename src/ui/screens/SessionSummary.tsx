import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { db } from '../../db/db.ts'
import { loadProgram } from '../../db/profiles.ts'
import { defaultTable, increaseFor } from '../../engine/progression.ts'
import { prChecks, prKind, type PrKind } from '../../engine/session.ts'
import { formatDate } from '../format.ts'

const PR_LABEL: Record<PrKind, string> = { e1rm: 'e1RM PR', reps: 'rep PR', heaviest: 'heaviest ever' }

export function SessionSummary() {
  const { id = '' } = useParams()
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id)
    if (!session) return { people: [] }
    const entries = await db.entries.where('sessionId').equals(id).toArray()
    const people = []
    for (const profileId of session.participants) {
      const entry = entries.find((e) => e.profileId === profileId)
      const profile = await db.profiles.get(profileId)
      if (!entry || !profile) continue
      people.push({
        entry,
        profile,
        program: await loadProgram(profileId),
        history: await db.sets.where('profileId').equals(profileId).toArray(),
      })
    }
    return { session, people }
  }, [id])
  if (!data) return null
  if (!data.session) return <p className="muted">That workout doesn't exist.</p>

  return (
    <>
      <h1>Workout done</h1>
      <p className="muted no-margin">{formatDate(data.session.startedAt)}</p>

      {data.people.map(({ entry, profile, program, history }) => {
        const sets = history.filter((s) => s.sessionId === id && !s.warmup).sort((a, b) => a.at - b.at)
        const prs = prChecks(history)
        const dayName = program?.days.find((d) => d.id === entry.dayId)?.name ?? 'Workout'
        const highlights = sets.flatMap((s) => {
          const kind = prKind(prs.get(s.id))
          return kind ? [{ set: s, kind }] : []
        })
        const stars = sets.filter((s) => s.progression)

        return (
          <section key={entry.id} className="card">
            <div className="title-row">
              <span className="dot" style={{ background: profile.color }} />
              <h2 className="grow no-margin">{profile.name}</h2>
              <span className="muted small">{dayName}</span>
            </div>
            {sets.length === 0 ? (
              <p className="muted">Nothing logged, so {dayName} stays open for another time.</p>
            ) : (
              <>
                <p className="no-margin">{sets.length} sets logged.</p>
                {stars.map((s) => {
                  const tmId = s.tmExerciseId ?? s.exerciseId
                  const table =
                    profile.progressionTables?.[tmId] ?? defaultTable(findExercise(tmId)?.region ?? 'upper')
                  const bump = increaseFor(s.reps, table)
                  return (
                    <p key={s.id} className="no-margin">
                      {findExercise(s.exerciseId)?.name} 1+ set: {s.weight} × {s.reps}.{' '}
                      <span className="muted">
                        {bump ? `+${bump} suggested at Start Week.` : 'TM holds.'}
                      </span>
                    </p>
                  )
                })}
                {highlights.length > 0 && (
                  <ul className="pr-list">
                    {highlights.map(({ set, kind }) => (
                      <li key={set.id}>
                        <span className="badge badge-pr">{kind === 'e1rm' ? 'PR' : kind === 'reps' ? 'Rep PR' : 'Heaviest'}</span>{' '}
                        {findExercise(set.exerciseId)?.name} {set.weight} × {set.reps} ({PR_LABEL[kind]})
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {entry.notes && <p className="muted small">“{entry.notes}”</p>}
          </section>
        )
      })}

      <Link to="/" className="btn btn-big">
        Done
      </Link>
    </>
  )
}
