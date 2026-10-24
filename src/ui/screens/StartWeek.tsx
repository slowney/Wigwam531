import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { db, type ProfileRow, type TmChangeReason } from '../../db/db.ts'
import { loadWeekOverview, loadWeekReview, startWeeks, type WeekOverview, type WeekReview } from '../../db/weeks.ts'
import type { WeekType } from '../../engine/plan.ts'
import { dayLabel } from '../../engine/program.ts'
import type { TmProposal } from '../../engine/progression.ts'
import type { WeekRecap } from '../../engine/metrics.ts'
import { BackLink, Segmented } from '../components/forms.tsx'
import { percentText, signed } from '../format.ts'

/** The week that's ending, in a few lines: PRs, weight moved, muscles on target and e1RMs. */
function Recap({ n, recap }: { n: number; recap: WeekRecap }) {
  if (recap.tonnage === 0) return null
  const vs = recap.lastWeek ? (recap.tonnage - recap.lastWeek) / recap.lastWeek : undefined
  return (
    <div className="recap">
      <p className="no-margin small">
        Week {n}: {recap.prs} {recap.prs === 1 ? 'PR' : 'PRs'} · {Math.round(recap.tonnage).toLocaleString()} lb moved
        {vs !== undefined ? ` (${percentText(vs)} on Week ${n - 1})` : ''} · {recap.musclesOnTarget} of{' '}
        {recap.musclesWithTarget} muscles on target
      </p>
      {recap.lifts.length > 0 && (
        <p className="no-margin small muted">
          {recap.lifts
            .map((l) => {
              const name = findExercise(l.exerciseId)?.short ?? findExercise(l.exerciseId)?.name ?? l.exerciseId
              return `${name} e1RM ${Math.round(l.e1rm)}${l.before !== undefined ? ` (${signed(l.e1rm - l.before)})` : ''}`
            })
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

interface Item {
  profile: ProfileRow
  overview: WeekOverview
  review: WeekReview
}

export function StartWeek() {
  const [params] = useSearchParams()
  const ids = params.get('ids')
  const items = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray())
      .filter((p) => !p.archived)
      .sort((a, b) => a.createdAt - b.createdAt)
    const out: Item[] = []
    for (const profile of profiles) {
      const overview = await loadWeekOverview(profile.id)
      // Without ?ids, everyone whose week is finished.
      if (ids ? !ids.split(',').includes(profile.id) : !overview.complete) continue
      const review = await loadWeekReview(profile.id)
      if (review) out.push({ profile, overview, review })
    }
    return out
  }, [ids])
  if (!items) return null
  // Keyed so the form starts fresh if the people change.
  return <Review key={items.map((i) => i.profile.id).join()} items={items} />
}

interface Choice {
  include: boolean
  type: WeekType
  tms: Record<string, { lb: number; reason: TmChangeReason }>
}

function initialChoice(item: Item): Choice {
  const tms: Choice['tms'] = {}
  for (const p of item.review.proposals) {
    tms[p.exerciseId] = { lb: p.proposed, reason: p.reason === 'tmTestFailed' ? 'tmTest' : 'progression' }
  }
  // A due deload or TM test comes preselected; it's still one tap to change.
  return { include: item.overview.complete, type: item.review.suggestion?.type ?? 'normal', tms }
}

function why(p: TmProposal): string {
  const bump = p.proposed - p.current
  switch (p.reason) {
    case 'progression':
      return `${p.reps} on the 1+ set: ${bump > 0 ? `+${bump}` : 'no change'}`
    case 'stall':
      return `${p.reps} on the 1+ set, two weeks running`
    case 'skipped':
      return "Not done this week, so it holds"
    case 'deload':
      return 'Deload week, so it holds'
    case 'tmTestPassed':
      return `${p.reps} at 100%: the TM is right`
    case 'tmTestFailed':
      return `${p.reps} at 100%: lowered`
  }
}

function Review({ items }: { items: Item[] }) {
  const navigate = useNavigate()
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(items.map((i) => [i.profile.id, initialChoice(i)])),
  )
  const [error, setError] = useState<string>()
  // Updater form, so quick taps on a stepper each count.
  const update = (id: string, change: (c: Choice) => Partial<Choice>) =>
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id]!, ...change(prev[id]!) } }))
  const setTm = (id: string, exerciseId: string, lb: (current: number) => number, reason: TmChangeReason) =>
    update(id, (c) => ({ tms: { ...c.tms, [exerciseId]: { lb: lb(c.tms[exerciseId]!.lb), reason } } }))

  const included = items.filter((i) => choices[i.profile.id]?.include)

  async function start() {
    try {
      await startWeeks(
        included.map((i) => {
          const c = choices[i.profile.id]!
          return {
            profileId: i.profile.id,
            type: c.type,
            tms: Object.entries(c.tms).map(([exerciseId, t]) => ({ exerciseId, lb: t.lb, reason: t.reason })),
          }
        }),
      )
      navigate('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <BackLink to="/" label="Home" />
      <h1>Start Week</h1>
      {items.length === 0 && <p className="muted">Nobody's week is finished yet.</p>}

      {items.map((item) => {
        const id = item.profile.id
        const c = choices[id]!
        const n = item.review.week.number
        const pending = item.overview.pending.map((d) => dayLabel(d, findExercise))
        return (
          <section key={id} className="card">
            <label className="toggle title-row">
              <input type="checkbox" checked={c.include} onChange={(e) => { const include = e.target.checked; update(id, () => ({ include })) }} />
              <span className="dot" style={{ background: item.profile.color }} />
              <strong className="grow">{item.profile.name}</strong>
              <span className="muted small">
                Week {n} → {n + 1}
              </span>
            </label>
            <Recap n={n} recap={item.review.recap} />
            {c.include && (
              <>
                {!item.overview.complete && pending.length > 0 && (
                  <p className="muted small">Week {n} isn't finished. Starting Week {n + 1} skips {pending.join(', ')}.</p>
                )}
                <Segmented
                  label="Week type"
                  value={c.type}
                  onChange={(type) => update(id, () => ({ type }))}
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'deload', label: 'Deload' },
                    { value: 'tmTest', label: 'TM test' },
                  ]}
                />
                {item.review.suggestion && (
                  <p className="small warn-text">
                    {item.review.suggestion.type === 'deload' ? 'Deload' : 'TM test'} suggested:{' '}
                    {item.review.suggestion.reason}
                  </p>
                )}
                {item.review.proposals.map((p) => {
                  const t = c.tms[p.exerciseId]!
                  return (
                    <div key={p.exerciseId} className="tm-line">
                      <div className="grow stack">
                        <strong>{findExercise(p.exerciseId)?.name ?? p.exerciseId}</strong>
                        <span className={p.reason === 'stall' ? 'small warn-text' : 'muted small'}>
                          {why(p)} · was {p.current}
                        </span>
                        {p.resetTo !== undefined && t.lb !== p.resetTo && (
                          <button
                            type="button"
                            className="btn btn-quiet btn-small reset-btn"
                            onClick={() => setTm(id, p.exerciseId, () => p.resetTo!, 'reset')}
                          >
                            Reset to {p.resetTo}
                          </button>
                        )}
                      </div>
                      <div className="tm-stepper">
                        <button
                          type="button"
                          className="btn btn-quiet step"
                          aria-label={`Lower ${p.exerciseId} TM`}
                          onClick={() => setTm(id, p.exerciseId, (lb) => Math.max(5, lb - 5), 'manual')}
                        >
                          −
                        </button>
                        <output className="tm-value">{t.lb}</output>
                        <button
                          type="button"
                          className="btn btn-quiet step"
                          aria-label={`Raise ${p.exerciseId} TM`}
                          onClick={() => setTm(id, p.exerciseId, (lb) => lb + 5, 'manual')}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </section>
        )
      })}

      {error && <p className="error">{error}</p>}
      {items.length > 0 && (
        <button type="button" className="btn btn-big" disabled={included.length === 0} onClick={() => void start()}>
          Start Week{included.length > 1 ? ` for ${included.length} people` : ''}
        </button>
      )}
    </>
  )
}
