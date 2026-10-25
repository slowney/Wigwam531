import { useLiveQuery } from 'dexie-react-hooks'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { db } from '../../db/db.ts'
import { activeSession } from '../../db/sessions.ts'
import { loadWeekOverview, weekState, type WeekOverview } from '../../db/weeks.ts'
import { dayLabel } from '../../engine/program.ts'
import { statusOf } from '../../engine/week.ts'
import { BackupReminder } from '../BackupPrompt.tsx'
import { Icon } from '../icons.tsx'
import { Mark } from '../Mark.tsx'

function weekLine(o: WeekOverview | undefined): string {
  if (!o?.program) return 'No program'
  const n = o.week?.number ?? 1
  if (o.complete) return `Week ${n} done · ready for Start Week`
  const type = o.week?.type === 'deload' ? ' · deload' : o.week?.type === 'tmTest' ? ' · TM test' : ''
  return `Week ${n}${type}`
}

/** One dot per program day, in the person's colour: filled done, ringed to do, dashed skipped. */
function WeekDots({ overview, color }: { overview: WeekOverview; color: string }) {
  if (!overview.program) return null
  const state = overview.week ? weekState(overview.week) : undefined
  return (
    <span className="week-dots" aria-hidden="true">
      {overview.program.days.map((d) => {
        const status = state ? statusOf(state, d.id) : 'pending'
        return <span key={d.id} className={`week-dot week-dot-${status}`} style={{ '--person': color } as CSSProperties} />
      })}
    </span>
  )
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

  // Who's up, and on which day: the people with days left this week.
  const upNext = profiles.flatMap((p) => {
    const day = overviews[p.id]?.pending[0]
    return day && !overviews[p.id]?.complete ? [{ profile: p, day: dayLabel(day, findExercise) }] : []
  })

  return (
    <>
      <h1 className="wordmark">
        <Mark />
        <span>
          Wigwam<span className="wordmark-num">531</span>
        </span>
      </h1>

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
            <section className="card today">
              <h2 className="today-title">Today</h2>
              {upNext.length === 0 ? (
                <p className="muted small">Everyone's week is done. Start the next one below.</p>
              ) : (
                <ul className="today-list">
                  {upNext.map(({ profile, day }) => (
                    <li key={profile.id}>
                      <span className="dot" style={{ background: profile.color }} />
                      <strong>{profile.name}</strong>
                      <span className="muted grow">{day}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/workout" className="btn btn-big">
                <Icon name="barbell" size="1.5rem" />
                Start workout
              </Link>
            </section>
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
                  <span className="grow stack">
                    <strong>{p.name}</strong>
                    <span className="muted small">{weekLine(overviews[p.id])}</span>
                  </span>
                  {overviews[p.id] && <WeekDots overview={overviews[p.id]!} color={p.color} />}
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
