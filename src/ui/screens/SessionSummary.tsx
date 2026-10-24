import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { db, type EntryRow } from '../../db/db.ts'
import { loadProgram } from '../../db/profiles.ts'
import { rateEntry } from '../../db/sessions.ts'
import { dayLabel } from '../../engine/program.ts'
import { defaultTable, increaseFor } from '../../engine/progression.ts'
import { prChecks, prKind, type PrKind } from '../../engine/session.ts'
import type { Stars } from '../../engine/types.ts'
import { BackupReminder } from '../BackupPrompt.tsx'
import { formatDate } from '../format.ts'

const PR_LABEL: Record<PrKind, string> = { e1rm: 'e1RM PR', reps: 'rep PR', heaviest: 'heaviest ever' }
const PR_BADGE: Record<PrKind, string> = { e1rm: 'PR', reps: 'Rep PR', heaviest: 'Heaviest' }

const RATINGS: { value: Stars; word: string }[] = [
  { value: 1, word: 'Rough' },
  { value: 2, word: 'Meh' },
  { value: 3, word: 'OK' },
  { value: 4, word: 'Good' },
  { value: 5, word: 'Great' },
]

/** How the whole workout felt. Tapping the current rating again clears it. */
function WorkoutRating({ entry }: { entry: EntryRow }) {
  const chosen = RATINGS.find((r) => r.value === entry.rating)
  return (
    <div className="workout-rating">
      <span className="label">How was it?{chosen ? ` ${chosen.word}.` : ''}</span>
      <div className="stars" role="radiogroup" aria-label="Workout rating">
        {RATINGS.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={entry.rating === r.value}
            aria-label={`${r.value}: ${r.word}`}
            className={entry.rating !== undefined && r.value <= entry.rating ? 'star star-on' : 'star'}
            onClick={() => void rateEntry(entry.id, entry.rating === r.value ? undefined : r.value)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

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
        week: await db.weeks.get(entry.weekId),
        history: await db.sets.where('profileId').equals(profileId).toArray(),
      })
    }
    return { session, people }
  }, [id])
  if (!data) return null
  if (!data.session) return <p className="muted">That workout doesn't exist.</p>
  const session = data.session

  return (
    <>
      <h1>Workout done</h1>
      <p className="muted">{formatDate(session.startedAt)}</p>

      <BackupReminder only="weekDone" />

      {data.people.map(({ entry, profile, program, week, history }) => {
        const sets = history.filter((s) => s.sessionId === id && !s.warmup).sort((a, b) => a.at - b.at)
        const prs = prChecks(history)
        const day = program?.days.find((d) => d.id === entry.dayId)
        const dayName = day ? dayLabel(day, findExercise) : 'Workout'
        const highlights = sets.flatMap((s) => {
          const kind = prKind(prs.get(s.id))
          return kind ? [{ set: s, kind }] : []
        })
        const stars = sets.filter((s) => s.progression)
        // This workout was the one that finished their week.
        const weekDone = week?.completedAt !== undefined && week.completedAt >= session.startedAt

        return (
          <section key={entry.id} className="card">
            <div className="title-row">
              <span className="dot" style={{ background: profile.color }} />
              <h2 className="grow no-margin">{profile.name}</h2>
            </div>
            <p className="muted small no-margin">{dayName}</p>
            {sets.length === 0 ? (
              <p className="muted">Nothing logged, so that day stays open for another time.</p>
            ) : (
              <>
                <WorkoutRating entry={entry} />
                <p className="no-margin">
                  {sets.length} {sets.length === 1 ? 'set' : 'sets'} logged.
                  {weekDone ? ` That finishes Week ${week!.number}.` : ''}
                </p>
                {stars.map((s) => {
                  const tmId = s.tmExerciseId ?? s.exerciseId
                  const table =
                    profile.progressionTables?.[tmId] ?? defaultTable(findExercise(tmId)?.region ?? 'upper')
                  const bump = increaseFor(s.reps, table)
                  return (
                    <p key={s.id} className="no-margin">
                      {findExercise(s.exerciseId)?.name} 1+ set: {s.weight} × {s.reps}.{' '}
                      <span className="muted">{bump ? `+${bump} suggested at Start Week.` : 'TM holds.'}</span>
                    </p>
                  )
                })}
                {highlights.length > 0 && (
                  <ul className="pr-list">
                    {highlights.map(({ set, kind }) => (
                      <li key={set.id}>
                        <span className="badge badge-pr">{PR_BADGE[kind]}</span> {findExercise(set.exerciseId)?.name}{' '}
                        {set.weight} × {set.reps} ({PR_LABEL[kind]})
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
