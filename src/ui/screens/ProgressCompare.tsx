import { useLiveQuery } from 'dexie-react-hooks'
import { findExercise } from '../../data/exercises.ts'
import { findScheme } from '../../data/schemes.ts'
import { db, type ProfileRow, type SetRow } from '../../db/db.ts'
import { loadBodyweights, loadProgram } from '../../db/profiles.ts'
import { bests, e1rmSeries } from '../../engine/metrics.ts'
import { requiredTms } from '../../engine/program.ts'
import { LineChart } from '../charts/LineChart.tsx'
import { formatDate } from '../format.ts'
import { MAX_COMPARED, type Slots } from '../compare.ts'

// Comparison colours by slot: checked against each other on every pair
// (colour-blind included) and against the card surface. Profile colours
// aren't used here: several of them are too alike to tell lines apart.
export const COMPARE_COLORS = ['var(--compare-1)', 'var(--compare-2)', 'var(--compare-3)'] as const

const nameOf = (id: string) => findExercise(id)?.name ?? id
// The big four first, in a fixed order, so everyone's charts line up.
const ORDER = ['bench-press', 'squat', 'overhead-press', 'deadlift']

interface Person {
  slot: number
  profile: ProfileRow
  sets: SetRow[]
  lifts: string[]
  bodyweight?: number
}

/** Main lifts for up to three people on shared charts, plus their bests side by side. */
export function CompareView(props: { slots: Slots; from: number; to: number }) {
  const key = props.slots.join(',')
  const people = useLiveQuery(async () => {
    const out: Person[] = []
    for (const [slot, id] of props.slots.entries()) {
      if (!id) continue
      const profile = await db.profiles.get(id)
      if (!profile) continue
      const program = await loadProgram(id)
      const tmLifts = (await db.trainingMaxes.where('profileId').equals(id).toArray()).map((t) => t.exerciseId)
      out.push({
        slot,
        profile,
        sets: await db.sets.where('profileId').equals(id).toArray(),
        lifts: [...new Set([...(program ? requiredTms(program, findScheme) : []), ...tmLifts])],
        bodyweight: (await loadBodyweights(id))[0]?.lb,
      })
    }
    return out
  }, [key])
  if (!people) return null
  if (people.length < 2) {
    return <p className="muted">Pick at least two people to compare, up to {MAX_COMPARED}.</p>
  }

  const all = [...new Set(people.flatMap((p) => p.lifts))]
  const lifts = [...ORDER.filter((id) => all.includes(id)), ...all.filter((id) => !ORDER.includes(id))]

  return (
    <>
      {lifts.map((liftId) => {
        const lines = people
          .map((p) => ({ person: p, series: e1rmSeries(p.sets, liftId, 'week') }))
          .filter((l) => l.series.length > 0)
        if (lines.length === 0) return null
        return (
          <section key={liftId} className="card">
            <h2>{nameOf(liftId)}</h2>
            <LineChart
              label={`${nameOf(liftId)}: e1RM for ${lines.map((l) => l.person.profile.name).join(', ')}`}
              from={props.from}
              to={props.to}
              series={lines.map(({ person, series }) => ({
                name: person.profile.name,
                color: COMPARE_COLORS[person.slot]!,
                dots: true,
                points: series.map((p) => ({ x: p.at, y: p.e1rm, key: `${person.profile.id}:${p.setId}` })),
              }))}
              readout={(x) => (
                <>
                  {formatDate(x)} ·{' '}
                  {lines
                    .map(({ person, series }) => {
                      // Each person's latest e1RM as of the chosen day.
                      const p = series.filter((q) => q.at <= x).at(-1)
                      return `${person.profile.name} ${p ? Math.round(p.e1rm) : '–'}`
                    })
                    .join(' · ')}
                </>
              )}
            />
          </section>
        )
      })}
      <BestsTable people={people} lifts={lifts} />
    </>
  )
}

/** Each person's best e1RM per lift, and against their bodyweight when it's logged. */
function BestsTable({ people, lifts }: { people: Person[]; lifts: string[] }) {
  const shown = lifts.filter((id) => people.some((p) => bests(p.sets, id).e1rm))
  if (shown.length === 0) return null
  return (
    <section className="card">
      <h2>Best e1RMs</h2>
      <table className="rep-table compare-table">
        <thead>
          <tr>
            <th scope="col">Lift</th>
            {people.map((p) => (
              <th key={p.profile.id} scope="col">
                <span className="compare-key" style={{ background: COMPARE_COLORS[p.slot] }} />
                {p.profile.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((id) => (
            <tr key={id}>
              <th scope="row">{findExercise(id)?.short ?? nameOf(id)}</th>
              {people.map((p) => {
                const best = bests(p.sets, id).e1rm?.e1rm
                return (
                  <td key={p.profile.id}>
                    {best === undefined ? '–' : Math.round(best)}
                    {best !== undefined && p.bodyweight !== undefined && (
                      <span className="muted small"> {(best / p.bodyweight).toFixed(2)}×</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">The × is the best e1RM against the latest logged bodyweight, the fairer comparison.</p>
    </section>
  )
}

/** The heaviest set of each workout, oldest first. */
function topSets(sets: SetRow[]): { sessionId: string; at: number; weight: number }[] {
  const by = new Map<string, { sessionId: string; at: number; weight: number }>()
  for (const s of sets) {
    const seen = by.get(s.sessionId)
    if (!seen || s.weight > seen.weight) by.set(s.sessionId, { sessionId: s.sessionId, at: seen?.at ?? s.at, weight: s.weight })
  }
  return [...by.values()].sort((a, b) => a.at - b.at)
}

/** One exercise for up to three people: their lines together, and their bests side by side. */
export function ExerciseCompare(props: { exerciseId: string; slots: Slots; from: number; to: number }) {
  const { exerciseId } = props
  const key = props.slots.join(',')
  const people = useLiveQuery(async () => {
    const out: { slot: number; profile: ProfileRow; sets: SetRow[]; bodyweight?: number }[] = []
    for (const [slot, id] of props.slots.entries()) {
      const profile = id ? await db.profiles.get(id) : undefined
      if (!profile) continue
      const sets = (await db.sets.where('[profileId+exerciseId]').equals([profile.id, exerciseId]).toArray()).filter(
        (s) => !s.warmup,
      )
      out.push({ slot, profile, sets, bodyweight: (await loadBodyweights(profile.id))[0]?.lb })
    }
    return out
  }, [key, exerciseId])
  if (!people) return null
  if (people.length < 2) return <p className="muted">Pick at least two people to compare, up to {MAX_COMPARED}.</p>

  // Timed holds and high-rep work have no e1RM, so everyone gets their top set instead.
  const timed = findExercise(exerciseId)?.unit === 'seconds'
  const useE1rm = !timed && people.some((p) => e1rmSeries(p.sets, exerciseId).length > 0)
  const lines = people
    .map((p) => {
      const points = useE1rm
        ? e1rmSeries(p.sets, exerciseId).map((q) => ({ x: q.at, y: q.e1rm, key: `${p.profile.id}:${q.setId}` }))
        : topSets(p.sets).map((t) => ({ x: t.at, y: t.weight, key: `${p.profile.id}:${t.sessionId}` }))
      return { person: p, points }
    })
    .filter((l) => l.points.length > 0)

  return (
    <>
      {lines.length > 0 && (
        <section className="card">
          <LineChart
            label={`${nameOf(exerciseId)}: ${useE1rm ? 'e1RM' : 'top set'} for ${lines.map((l) => l.person.profile.name).join(', ')}`}
            from={props.from}
            to={props.to}
            series={lines.map(({ person, points }) => ({
              name: person.profile.name,
              color: COMPARE_COLORS[person.slot]!,
              dots: true,
              points,
            }))}
            readout={(x) => (
              <>
                {formatDate(x)} ·{' '}
                {lines
                  .map(({ person, points }) => {
                    const p = points.filter((q) => q.x <= x).at(-1)
                    return `${person.profile.name} ${p ? Math.round(p.y) : '–'}`
                  })
                  .join(' · ')}
              </>
            )}
          />
        </section>
      )}
      <section className="card">
        <h2>Bests</h2>
        <table className="rep-table compare-table">
          <thead>
            <tr>
              <th scope="col" />
              {people.map((p) => (
                <th key={p.profile.id} scope="col">
                  <span className="compare-key" style={{ background: COMPARE_COLORS[p.slot] }} />
                  {p.profile.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!timed && (
              <tr>
                <th scope="row">Best e1RM</th>
                {people.map((p) => {
                  const best = bests(p.sets, exerciseId).e1rm?.e1rm
                  return (
                    <td key={p.profile.id}>
                      {best === undefined ? '–' : Math.round(best)}
                      {best !== undefined && p.bodyweight !== undefined && (
                        <span className="muted small"> {(best / p.bodyweight).toFixed(2)}×</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )}
            <tr>
              <th scope="row">Heaviest</th>
              {people.map((p) => {
                const h = bests(p.sets, exerciseId).heaviest
                return <td key={p.profile.id}>{h ? `${h.weight} × ${h.reps}` : '–'}</td>
              })}
            </tr>
            <tr>
              <th scope="row">Workouts</th>
              {people.map((p) => (
                <td key={p.profile.id}>{new Set(p.sets.map((s) => s.sessionId)).size}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
