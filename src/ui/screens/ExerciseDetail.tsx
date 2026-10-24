import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { db } from '../../db/db.ts'
import { bests, e1rmPrs, e1rmSeries, rangeStart, repMaxes, tmSteps, type Range } from '../../engine/metrics.ts'
import { LineChart, type ChartSeries } from '../charts/LineChart.tsx'
import { compared, formatSlots, MAX_COMPARED, parseSlots, toggleSlot } from '../compare.ts'
import { BackLink, Segmented } from '../components/forms.tsx'
import { formatDate } from '../format.ts'
import { COMPARE_COLORS, ExerciseCompare } from './ProgressCompare.tsx'

const RANGES: ReadonlyArray<{ value: Range; label: string }> = [
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'All', label: 'All' },
]

/** One exercise for one person: its chart, rep maxes and every workout it was in. */
export function ExerciseDetail() {
  const { profileId = '', exerciseId = '' } = useParams()
  const [range, setRange] = useState<Range>('All')
  const [params, setParams] = useSearchParams()
  const slots = params.has('c') ? parseSlots(params.get('c')) : undefined
  const everyone = useLiveQuery(
    async () => (await db.profiles.toArray()).filter((p) => !p.archived).sort((a, b) => a.createdAt - b.createdAt),
    [],
  )
  const data = useLiveQuery(async () => {
    const profile = await db.profiles.get(profileId)
    const sets = (await db.sets.where('[profileId+exerciseId]').equals([profileId, exerciseId]).toArray()).filter(
      (s) => !s.warmup,
    )
    const tmHistory = await db.trainingMaxes.where('[profileId+exerciseId]').equals([profileId, exerciseId]).toArray()
    return { profile, sets, tmHistory }
  }, [profileId, exerciseId])
  if (!data) return null
  const { profile, sets } = data
  const exercise = findExercise(exerciseId)
  const name = exercise?.name ?? exerciseId
  const back = `/progress?p=${profileId}`
  if (!profile) {
    return (
      <>
        <BackLink to="/progress" label="Progress" />
        <p className="muted">That profile doesn't exist.</p>
      </>
    )
  }

  const now = Date.now()
  const modes =
    everyone && everyone.length > 1 ? (
      <div className="range-picker">
        <Segmented
          label="Show"
          value={slots ? 'compare' : 'one'}
          onChange={(mode) => setParams(mode === 'compare' ? { c: profileId } : {}, { replace: true })}
          options={[
            { value: 'one', label: profile.name },
            { value: 'compare', label: 'Compare' },
          ]}
        />
      </div>
    ) : null

  if (slots && everyone) {
    const full = compared(slots).length >= MAX_COMPARED
    return (
      <>
        <BackLink to={back} label="Progress" />
        <h1>{name}</h1>
        {modes}
        <div className="chips person-chips" aria-label="Who to compare">
          {everyone.map((p) => {
            const slot = slots.indexOf(p.id)
            const on = slot >= 0
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                className={on ? 'chip chip-on' : 'chip'}
                onClick={() => setParams({ c: formatSlots(toggleSlot(slots, p.id)) }, { replace: true })}
              >
                {on ? (
                  <span className="compare-key" style={{ background: COMPARE_COLORS[slot] }} />
                ) : (
                  <span className="dot" style={{ background: p.color }} />
                )}
                {p.name}
              </button>
            )
          })}
        </div>
        <div className="range-picker">
          <Segmented label="Range" value={range} onChange={setRange} options={RANGES} />
        </div>
        <ExerciseCompare exerciseId={exerciseId} slots={slots} from={rangeStart(range, now)} to={now} />
      </>
    )
  }

  const timed = exercise?.unit === 'seconds'
  const series = e1rmSeries(sets, exerciseId)
  const steps = tmSteps(data.tmHistory, exerciseId)
  const prs = e1rmPrs(series)
  const best = bests(sets, exerciseId)

  // Timed holds and high-rep work have no e1RM, so they chart their top weight instead.
  const byWorkout = new Map<string, typeof sets>()
  for (const s of [...sets].sort((a, b) => a.at - b.at)) byWorkout.set(s.sessionId, [...(byWorkout.get(s.sessionId) ?? []), s])
  const tops = [...byWorkout.entries()].map(([sessionId, list]) => {
    const top = list.reduce((a, b) => (b.weight > a.weight ? b : a))
    return { sessionId, at: list[0]!.at, weight: top.weight, reps: top.reps, list }
  })
  const useE1rm = series.length > 0 && !timed
  const chartSeries: ChartSeries[] = useE1rm
    ? [
        ...(steps.length
          ? [{ name: 'TM', color: 'var(--chart-2)', step: true, points: steps.map((s, i) => ({ x: s.at, y: s.lb, key: `tm${i}` })) }]
          : []),
        { name: 'e1RM', color: 'var(--chart-1)', dots: true, points: series.map((p) => ({ x: p.at, y: p.e1rm, key: p.setId })) },
      ]
    : [{ name: 'Top set', color: 'var(--chart-1)', dots: true, points: tops.map((t) => ({ x: t.at, y: t.weight, key: t.sessionId })) }]

  return (
    <>
      <BackLink to={back} label="Progress" />
      <h1>{name}</h1>
      {modes ?? <p className="muted">{profile.name}</p>}

      {sets.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <>
          <section className="card">
            <div className="range-picker">
              <Segmented label="Range" value={range} onChange={setRange} options={RANGES} />
            </div>
            <LineChart
              label={`${name}: ${useE1rm ? 'e1RM' : 'top set'} over time`}
              from={rangeStart(range, now)}
              to={now}
              marked={useE1rm ? prs : undefined}
              series={chartSeries}
              readout={(x) => {
                if (useE1rm) {
                  const p = series.find((q) => q.at === x)
                  return p ? (
                    <>
                      {formatDate(p.at)} · e1RM <strong>{Math.round(p.e1rm)}</strong> ({p.weight} × {p.reps})
                      {prs.has(p.setId) ? ' · PR' : ''}
                    </>
                  ) : null
                }
                const t = tops.find((q) => q.at === x)
                return t ? (
                  <>
                    {formatDate(t.at)} · top set <strong>{t.weight}</strong> × {t.reps}
                    {timed ? ' s' : ''}
                  </>
                ) : null
              }}
            />
          </section>

          <section className="card">
            <h2>Bests</h2>
            <dl className="stat-grid">
              {best.e1rm && (
                <>
                  <dt>Best e1RM</dt>
                  <dd>
                    {Math.round(best.e1rm.e1rm)} <span className="muted small">{formatDate(best.e1rm.at)}</span>
                  </dd>
                </>
              )}
              {best.heaviest && (
                <>
                  <dt>Heaviest</dt>
                  <dd>
                    {best.heaviest.weight} × {best.heaviest.reps}{' '}
                    <span className="muted small">{formatDate(best.heaviest.at)}</span>
                  </dd>
                </>
              )}
            </dl>
            {!timed && (
              <table className="rep-table">
                <caption className="label">Heaviest for each number of reps</caption>
                <thead>
                  <tr>
                    <th scope="col">Reps</th>
                    <th scope="col">Weight</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {repMaxes(sets, exerciseId).map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{r ? r.weight : '—'}</td>
                      <td className="muted">{r ? formatDate(r.at) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2>History</h2>
            <ul className="list">
              {[...tops].reverse().map((t) => (
                <li key={t.sessionId} className="row history-row">
                  <span className="muted small history-date">{formatDate(t.at)}</span>
                  <span className="grow small mono">
                    {t.list.map((s) => `${s.weight}×${s.reps}${timed ? 's' : ''}`).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  )
}
