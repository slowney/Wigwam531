import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { NSUNS_4DAY } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { planAccessory, planDay, type PlanContext } from '../src/engine/plan.ts'
import {
  applySwaps,
  dayProgress,
  lastSessionSets,
  nextLifter,
  nextSet,
  prChecks,
  prKind,
  restSeconds,
  workingWeight,
} from '../src/engine/session.ts'
import { gymChecks, nextLoad } from '../src/engine/weights.ts'

const TMS = { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 }
const ctx = (overrides: Partial<PlanContext> = {}): PlanContext => ({
  weekType: 'normal',
  tms: TMS,
  schemes: findScheme,
  ...gymChecks(HOME_GYM, findExercise),
  ...overrides,
})
const day = (id: string) => NSUNS_4DAY.days.find((d) => d.id === id)!

describe('swapping a lift for today', () => {
  it('runs a lift with no TM of its own at its usual rep range, weight open', () => {
    const swapped = applySwaps(day('d2'), { 'd2-t1': 'front-squat' }, (id) => id in TMS, findExercise)
    const slot = planDay(swapped, ctx()).mains[0]!
    expect(slot).toMatchObject({ exerciseId: 'front-squat', kind: 'range', schemeId: 'range-3x5-8' })
    expect(slot.sets.map((s) => [s.weight, s.reps, s.repsMax])).toEqual(Array(3).fill([undefined, 5, 8]))
    expect(slot.warmups).toEqual([])
  })

  it('keeps the scheme for a lift with its own TM, and moves that TM instead', () => {
    const tms = { ...TMS, 'trap-bar-deadlift': 335 }
    const swapped = applySwaps(day('d4'), { 'd4-t1': 'trap-bar-deadlift' }, (id) => id in tms, findExercise)
    const slot = planDay(swapped, ctx({ tms })).mains[0]!
    expect(slot).toMatchObject({ exerciseId: 'trap-bar-deadlift', tmExerciseId: 'trap-bar-deadlift', tm: 335 })
    expect(slot.sets.find((s) => s.progression)?.weight).toBe(320) // 95% of 335 = 318.25
  })

  it('stops a swapped T2 borrowing the old lift\'s TM', () => {
    const tms = { ...TMS, 'trap-bar-deadlift': 335 }
    const swapped = applySwaps(day('d2'), { 'd2-t2': 'trap-bar-deadlift' }, (id) => id in tms, findExercise)
    expect(planDay(swapped, ctx({ tms })).mains[1]).toMatchObject({ tmExerciseId: 'trap-bar-deadlift', tm: 335 })
  })

  it('leaves unswapped slots alone', () => {
    expect(applySwaps(day('d1'), {}, () => false, findExercise)).toEqual(day('d1'))
  })
})

describe('accessories', () => {
  const pick = { id: 'acc-1', exerciseId: 'db-row', sets: 3, reps: [6, 10] as [number, number] }

  it('run sets x rep range at the carried-over weight', () => {
    const slot = planAccessory(pick, ctx({ workingWeights: { 'db-row': 50 } }))
    expect(slot).toMatchObject({ role: 'accessory', kind: 'range' })
    expect(slot.sets.map((s) => [s.weight, s.reps, s.repsMax])).toEqual(Array(3).fill([50, 6, 10]))
  })

  it('halve in a deload week', () => {
    expect(planAccessory(pick, ctx({ weekType: 'deload' })).sets).toHaveLength(2)
  })
})

describe('progress through a day', () => {
  const slots = planDay(day('d1'), ctx()).mains // 9 bench sets, then 8 OHP sets

  it('points at the first working set with nothing logged', () => {
    expect(nextSet(slots, [])).toEqual({ slotId: 'd1-t1', index: 0 })
    const logged = [
      { slotId: 'd1-t1', index: 0, warmup: true },
      { slotId: 'd1-t1', index: 0, warmup: false },
      { slotId: 'd1-t1', index: 2, warmup: false },
    ]
    expect(nextSet(slots, logged)).toEqual({ slotId: 'd1-t1', index: 1 })
  })

  it('counts working sets only', () => {
    const logged = [
      { slotId: 'd1-t1', index: 0, warmup: true },
      { slotId: 'd1-t1', index: 0, warmup: false },
      { slotId: 'd1-t2', index: 7, warmup: false },
    ]
    expect(dayProgress(slots, logged)).toEqual({ done: 2, total: 17 })
  })

  it('is finished when every planned set is logged', () => {
    const all = slots.flatMap((s) => s.sets.map((_, index) => ({ slotId: s.slotId, index, warmup: false })))
    expect(nextSet(slots, all)).toBeUndefined()
  })
})

describe('rest', () => {
  it('gives heavy singles and triples three minutes', () => {
    expect(restSeconds({ reps: 1, pct: 95 }, 'main')).toBe(180)
    expect(restSeconds({ reps: 3, pct: 80 }, 'main')).toBe(180)
  })

  it('gives a light T2 triple the normal two minutes', () => {
    expect(restSeconds({ reps: 3, pct: 70 }, 'main')).toBe(120)
  })

  it('gives everything else on a main lift two minutes, accessories ninety seconds', () => {
    expect(restSeconds({ reps: 5, pct: 75 }, 'main')).toBe(120)
    expect(restSeconds({ reps: 6 }, 'main')).toBe(120) // heavy row, rep range
    expect(restSeconds({ reps: 12 }, 'accessory')).toBe(90)
  })
})

describe('who lifts next', () => {
  const order = ['a', 'b', 'c']
  it('rotates through the group', () => {
    expect(nextLifter(order, 'a', () => true)).toBe('b')
    expect(nextLifter(order, 'c', () => true)).toBe('a')
  })
  it('skips anyone who is finished', () => {
    expect(nextLifter(order, 'a', (id) => id !== 'b')).toBe('c')
  })
  it('stays put when nobody else has sets left', () => {
    expect(nextLifter(order, 'a', (id) => id === 'a')).toBe('a')
  })
})

const set = (id: string, sessionId: string, at: number, weight: number, reps: number, warmup = false) => ({
  id,
  exerciseId: 'db-row',
  sessionId,
  weight,
  reps,
  warmup,
  at,
})

describe('carrying working weights over', () => {
  const history = [
    set('1', 'old', 1, 45, 10),
    set('2', 'old', 2, 45, 10),
    set('3', 'old', 3, 45, 10),
    set('4', 'last', 10, 20, 12, true),
    set('5', 'last', 11, 50, 10),
    set('6', 'last', 12, 50, 9),
    set('7', 'last', 13, 50, 8),
    set('8', 'today', 20, 50, 10),
  ]
  const nextDumbbell = (w: number) => nextLoad(w, 'dumbbell', HOME_GYM)

  it('reads the most recent earlier session, skipping warm-ups and today', () => {
    expect(lastSessionSets(history, 'db-row', 'today').map((s) => s.id)).toEqual(['5', '6', '7'])
  })

  it('holds the weight until every set hits the top of the range', () => {
    expect(workingWeight(history, 'db-row', { sets: 3, reps: [6, 10] }, nextDumbbell, 'today')).toEqual({
      weight: 50,
      reason: 'hold',
    })
    const earned = history.map((s) => (s.sessionId === 'last' && !s.warmup ? { ...s, reps: 10 } : s))
    expect(workingWeight(earned, 'db-row', { sets: 3, reps: [6, 10] }, nextDumbbell, 'today')).toEqual({
      weight: 55,
      reason: 'increase',
    })
  })
})

describe('PRs', () => {
  it('compare each set with earlier sessions', () => {
    const checks = prChecks([
      set('a', 's1', 1, 50, 8),
      set('b', 's2', 2, 50, 10),
      set('c', 's2', 3, 50, 9),
      set('d', 's3', 4, 55, 6),
    ])
    expect(prKind(checks.get('a'))).toBeUndefined() // first time
    expect(prKind(checks.get('b'))).toBe('e1rm')
    // Beats session 1; set b in its own session doesn't count against it.
    expect(prKind(checks.get('c'))).toBe('e1rm')
    expect(prKind(checks.get('d'))).toBe('heaviest')
  })

  it('never badge anything in the first session for an exercise', () => {
    // An nSuns pyramid: every set heavier than the one before.
    const pyramid = [170, 190, 215].map((w, i) => set(`p${i}`, 'first', i, w, 3))
    const checks = prChecks(pyramid)
    expect(pyramid.map((s) => prKind(checks.get(s.id)))).toEqual([undefined, undefined, undefined])
  })
})
