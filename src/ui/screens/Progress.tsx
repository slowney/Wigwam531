import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { findScheme } from '../../data/schemes.ts'
import { db, type ProfileRow, type SetRow, type TrainingMaxRow } from '../../db/db.ts'
import { loadBodyweights, loadProgram, loadTargets } from '../../db/profiles.ts'
import {
  bests,
  dots,
  e1rmPrs,
  e1rmSeries,
  rangeStart,
  tmSteps,
  weeklyVolume,
  type Range,
} from '../../engine/metrics.ts'
import { dayLabel, requiredTms, type Program } from '../../engine/program.ts'
import { MUSCLE_LABELS, MUSCLES, type Muscle, type MuscleTargets } from '../../engine/types.ts'
import { LineChart } from '../charts/LineChart.tsx'
import { TargetBars, WeekColumns } from '../charts/VolumeCharts.tsx'
import { Segmented } from '../components/forms.tsx'
import { formatDate } from '../format.ts'

const RANGES: ReadonlyArray<{ value: Range; label: string }> = [
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'All', label: 'All' },
]

const nameOf = (id: string) => findExercise(id)?.name ?? id
const lb = (n: number) => `${Math.round(n)}`
const SBD = ['squat', 'bench-press', 'deadlift']

export function Progress() {
  const [params, setParams] = useSearchParams()
  const [range, setRange] = useState<Range>('6M')
  const chosen = params.get('p') ?? undefined
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray()).filter((p) => !p.archived).sort((a, b) => a.createdAt - b.createdAt)
    const profile = profiles.find((p) => p.id === chosen) ?? profiles[0]
    if (!profile) return { profiles }
    const id = profile.id
    return {
      profiles,
      profile,
      program: await loadProgram(id),
      sets: await db.sets.where('profileId').equals(id).toArray(),
      tmHistory: await db.trainingMaxes.where('profileId').equals(id).toArray(),
      bodyweights: await loadBodyweights(id),
      weeks: await db.weeks.where('profileId').equals(id).toArray(),
      targets: await loadTargets(id),
    }
  }, [chosen])
  if (!data) return null
  const { profiles, profile } = data
  // Read the clock once per render, so every chart shares the same "now".
  const now = Date.now()

  return (
    <>
      <h1>Progress</h1>
      {profiles.length > 1 && (
        <div className="chips person-chips" role="radiogroup" aria-label="Whose progress">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === profile?.id}
              className={p.id === profile?.id ? 'chip chip-on' : 'chip'}
              onClick={() => setParams({ p: p.id }, { replace: true })}
            >
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
      {!profile || !data.sets ? (
        <p className="muted">Add a profile to see progress here.</p>
      ) : (
        <>
          <div className="range-picker">
            <Segmented label="Range" value={range} onChange={setRange} options={RANGES} />
          </div>
          <MainLifts
            profile={profile}
            program={data.program}
            sets={data.sets}
            tmHistory={data.tmHistory}
            from={rangeStart(range, now)}
            to={now}
          />
          <PrBoard profile={profile} program={data.program} sets={data.sets} tmHistory={data.tmHistory} />
          <Volume sets={data.sets} weeks={data.weeks} targets={data.targets} />
          <Bodyweight entries={data.bodyweights} from={rangeStart(range, now)} to={now} />
          {profile.advanced && <Advanced profile={profile} sets={data.sets} bodyweight={data.bodyweights[0]?.lb} />}
          <Workouts profileId={profile.id} />
        </>
      )}
      {import.meta.env.DEV && <DemoButton onLoaded={(id) => setParams({ p: id }, { replace: true })} />}
    </>
  )
}

/** The lifts with a TM, in program order, then any others that still have TM history. */
function tmLifts(program: Program | undefined, tmHistory: TrainingMaxRow[]): string[] {
  const ids = program ? requiredTms(program, findScheme) : []
  for (const t of tmHistory) if (!ids.includes(t.exerciseId)) ids.push(t.exerciseId)
  return ids
}

function MainLifts(props: {
  profile: ProfileRow
  program?: Program
  sets: SetRow[]
  tmHistory: TrainingMaxRow[]
  from: number
  to: number
}) {
  const lifts = tmLifts(props.program, props.tmHistory)
  if (lifts.length === 0) return null
  return (
    <>
      {lifts.map((id) => {
        const series = e1rmSeries(props.sets, id, 'week')
        const steps = tmSteps(props.tmHistory, id)
        const prs = e1rmPrs(series)
        const pointAt = (x: number) => series.find((p) => p.at === x)
        const tmAt = (x: number) => steps.filter((s) => s.at <= x).at(-1)?.lb
        return (
          <section key={id} className="card">
            <div className="title-row">
              <h2 className="grow no-margin">{nameOf(id)}</h2>
              <Link to={`/progress/${props.profile.id}/${id}`} className="btn btn-quiet btn-small">
                Details
              </Link>
            </div>
            <LineChart
              label={`${nameOf(id)}: e1RM and TM over time`}
              from={props.from}
              to={props.to}
              marked={prs}
              series={[
                {
                  name: 'TM',
                  color: 'var(--chart-2)',
                  step: true,
                  points: steps.map((s, i) => ({ x: s.at, y: s.lb, key: `tm${i}` })),
                },
                {
                  name: 'e1RM',
                  color: 'var(--chart-1)',
                  dots: true,
                  points: series.map((p) => ({ x: p.at, y: p.e1rm, key: p.setId })),
                },
              ]}
              readout={(x) => {
                const p = pointAt(x)
                const tm = tmAt(x)
                if (!p) return tm !== undefined ? <>TM <strong>{tm}</strong></> : null
                return (
                  <>
                    {formatDate(p.at)} · e1RM <strong>{lb(p.e1rm)}</strong> ({p.weight} × {p.reps})
                    {tm !== undefined ? ` · TM ${tm}` : ''}
                    {prs.has(p.setId) ? ' · PR' : ''}
                  </>
                )
              }}
            />
          </section>
        )
      })}
    </>
  )
}

function PrBoard(props: { profile: ProfileRow; program?: Program; sets: SetRow[]; tmHistory: TrainingMaxRow[] }) {
  const lifts = tmLifts(props.program, props.tmHistory).filter((id) => props.sets.some((s) => s.exerciseId === id))
  // Everything else that's been logged, for the rest of the history.
  const others = [...new Set(props.sets.filter((s) => !s.warmup).map((s) => s.exerciseId))]
    .filter((id) => !lifts.includes(id))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  if (lifts.length + others.length === 0) return null
  const link = (id: string) => `/progress/${props.profile.id}/${id}`
  return (
    <section className="card">
      <h2>PRs</h2>
      <ul className="list">
        {lifts.map((id) => {
          const best = bests(props.sets, id)
          return (
            <li key={id}>
              <Link to={link(id)} className="list-row">
                <span className="grow stack">
                  <strong>{nameOf(id)}</strong>
                  <span className="muted small">
                    {best.e1rm ? `e1RM ${lb(best.e1rm.e1rm)} (${best.e1rm.weight} × ${best.e1rm.reps}, ${formatDate(best.e1rm.at)})` : 'No e1RM yet'}
                    {best.heaviest ? ` · heaviest ${best.heaviest.weight} × ${best.heaviest.reps}` : ''}
                  </span>
                </span>
                <span className="chev">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
      {others.length > 0 && (
        <details className="archived">
          <summary>Every other exercise ({others.length})</summary>
          <ul className="list">
            {others.map((id) => {
              const best = bests(props.sets, id)
              return (
                <li key={id}>
                  <Link to={link(id)} className="list-row">
                    <span className="grow stack">
                      <span>{nameOf(id)}</span>
                      {best.heaviest && (
                        <span className="muted small">
                          Heaviest {best.heaviest.weight} × {best.heaviest.reps}, {formatDate(best.heaviest.at)}
                        </span>
                      )}
                    </span>
                    <span className="chev">›</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </section>
  )
}

function Volume(props: { sets: SetRow[]; weeks: { id: string; number: number }[]; targets: MuscleTargets }) {
  const [muscle, setMuscle] = useState<Muscle>()
  const weeks = weeklyVolume(props.sets, props.weeks, findExercise, 8)
  const current = weeks.at(-1)
  if (!current) return null
  const rows = MUSCLES.filter((m) => props.targets[m] > 0).map((m) => ({
    key: m,
    label: MUSCLE_LABELS[m],
    value: current.counts[m] ?? 0,
    target: props.targets[m],
  }))
  return (
    <section className="card">
      <h2>Sets per muscle, Week {current.number}</h2>
      <p className="muted small no-margin">Against each weekly target (the tick). Tap a muscle for its last 8 weeks.</p>
      <TargetBars rows={rows} selected={muscle} onSelect={(m) => setMuscle(muscle === m ? undefined : (m as Muscle))} />
      {muscle && (
        <WeekColumns
          label={`${MUSCLE_LABELS[muscle]} sets, last 8 weeks`}
          target={props.targets[muscle]}
          weeks={weeks.map((w) => ({ number: w.number, value: w.counts[muscle] ?? 0 }))}
        />
      )}
    </section>
  )
}

function Bodyweight(props: { entries: { id: string; lb: number; at: number }[]; from: number; to: number }) {
  if (props.entries.length === 0) return null
  const points = [...props.entries].reverse().map((b) => ({ x: b.at, y: b.lb, key: b.id }))
  return (
    <section className="card">
      <h2>Bodyweight</h2>
      <LineChart
        label="Bodyweight over time"
        from={props.from}
        to={props.to}
        series={[{ name: 'Bodyweight', color: 'var(--chart-1)', dots: true, points }]}
        formatY={(y) => String(Math.round(y))}
        readout={(x) => {
          const p = points.find((q) => q.x === x)
          return p ? (
            <>
              {formatDate(p.x)} · <strong>{p.y}</strong> lb
            </>
          ) : null
        }}
      />
    </section>
  )
}

/** Lift ÷ bodyweight, the estimated total and DOTS, from each lift's best e1RM. */
function Advanced(props: { profile: ProfileRow; sets: SetRow[]; bodyweight?: number }) {
  const best = (id: string) => bests(props.sets, id).e1rm?.e1rm
  const lifts = ['bench-press', 'squat', 'overhead-press', 'deadlift'].filter((id) => best(id) !== undefined)
  const total = SBD.every((id) => best(id) !== undefined) ? SBD.reduce((sum, id) => sum + best(id)!, 0) : undefined
  return (
    <section className="card">
      <h2>Advanced</h2>
      {props.bodyweight === undefined && <p className="muted small">Log a bodyweight to see lifts against it.</p>}
      <dl className="stat-grid">
        {props.bodyweight !== undefined &&
          lifts.map((id) => (
            <div key={id} className="contents">
              <dt>{nameOf(id)} ÷ bodyweight</dt>
              <dd>{(best(id)! / props.bodyweight!).toFixed(2)}×</dd>
            </div>
          ))}
        {total !== undefined && (
          <>
            <dt>Squat + bench + deadlift</dt>
            <dd>{lb(total)}</dd>
          </>
        )}
        {total !== undefined && props.bodyweight !== undefined && props.profile.sex && (
          <>
            <dt>DOTS</dt>
            <dd>{dots(total, props.bodyweight, props.profile.sex).toFixed(1)}</dd>
          </>
        )}
      </dl>
      <p className="muted small">
        From each lift's best e1RM and the latest bodyweight.
        {!props.profile.sex ? ' DOTS appears once sex is set on Edit profile.' : ''}
      </p>
    </section>
  )
}

const SHOWN = 15

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * This person's finished workouts, newest first. Each opens its summary,
 * which is also where one can be reopened or deleted.
 */
function Workouts({ profileId }: { profileId: string }) {
  const [all, setAll] = useState(false)
  const data = useLiveQuery(async () => {
    const sessions = (await db.sessions.where('status').equals('done').toArray())
      .filter((s) => s.participants.includes(profileId))
      .sort((a, b) => b.startedAt - a.startedAt)
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
  }, [all, profileId])
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

/** Dev build only: six months of made-up training to check the charts against. */
function DemoButton({ onLoaded }: { onLoaded: (profileId: string) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-quiet btn-wide"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void import('../../db/demo.ts').then(({ loadDemo }) => loadDemo()).then(onLoaded).finally(() => setBusy(false))
      }}
    >
      Load demo data (dev only)
    </button>
  )
}
