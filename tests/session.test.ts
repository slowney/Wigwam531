import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { NSUNS_4DAY, NSUNS_4DAY_ROW } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { planAccessory, planDay, type PlanContext } from '../src/engine/plan.ts'
import {
  applySwaps,
  dayProgress,
  lastNotes,
  lastSessionSets,
  nextLifter,
  nextSet,
  planEntry,
  prChecks,
  prKind,
  restSeconds,
  slotCollapsed,
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

describe('folding exercises', () => {
  it('folds a finished exercise on its own', () => {
    expect(slotCollapsed(undefined, { done: 9, total: 9 })).toBe(true)
    expect(slotCollapsed(undefined, { done: 3, total: 9 })).toBe(false)
  })

  it('never folds a slot with nothing planned', () => {
    expect(slotCollapsed(undefined, { done: 0, total: 0 })).toBe(false)
  })

  it('keeps a choice made by hand either way', () => {
    expect(slotCollapsed(false, { done: 9, total: 9 })).toBe(false)
    expect(slotCollapsed(true, { done: 0, total: 9 })).toBe(true)
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
      last: 50,
    })
    const earned = history.map((s) => (s.sessionId === 'last' && !s.warmup ? { ...s, reps: 10 } : s))
    expect(workingWeight(earned, 'db-row', { sets: 3, reps: [6, 10] }, nextDumbbell, 'today')).toEqual({
      weight: 55,
      reason: 'increase',
      last: 50,
    })
  })

  it('steps an accessory up once a single set reaches the top', () => {
    expect(workingWeight(history, 'db-row', { sets: 3, reps: [6, 10] }, nextDumbbell, 'today', 'any')).toEqual({
      weight: 55,
      reason: 'increase',
      last: 50,
    })
  })

  it("plans accessories by that rule and the heavy row by the stricter one, saying why", () => {
    // Last time: rows 135 × 8, 8, 8, 7 and DB rows 50 × 10, 9, 8.
    const logged = [
      ...[8, 8, 8, 7].map((reps, i) => ({ ...set(`r${i}`, 'last', 10 + i, 135, reps), exerciseId: 'barbell-row' })),
      ...[10, 9, 8].map((reps, i) => set(`d${i}`, 'last', 20 + i, 50, reps)),
    ]
    const plan = planEntry({
      program: NSUNS_4DAY_ROW,
      dayId: 'd1',
      swaps: {},
      accessories: [{ id: 'pick', exerciseId: 'db-row', sets: 3, reps: [6, 10] }],
      weekType: 'normal',
      tms: TMS,
      history: logged,
      sessionId: 'today',
      gym: HOME_GYM,
      lookup: findExercise,
      schemes: findScheme,
    })!
    const row = plan.slots.find((s) => s.exerciseId === 'barbell-row')!
    const dbRow = plan.slots.find((s) => s.slotId === 'pick')!
    expect(row.sets[0]?.weight).toBe(135)
    expect(row.carried).toMatchObject({ reason: 'hold', last: 135 })
    expect(dbRow.sets[0]?.weight).toBe(55)
    expect(dbRow.carried).toMatchObject({ reason: 'increase', last: 50 })
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

  it('only go to sets that did more than prescribed', () => {
    const rx = (s: ReturnType<typeof set>, reps: number, extra: object = {}) => ({ ...s, prescribedReps: reps, ...extra })
    const checks = prChecks([
      rx(set('a', 'w1', 1, 170, 3), 3),
      rx(set('b', 'w1', 2, 190, 2), 1, { amrap: true }),
      // Week 2, TM up: every set is heavier, and the backoff estimates high.
      rx(set('c', 'w2', 3, 195, 3), 3),
      rx(set('d', 'w2', 4, 200, 1), 1, { amrap: true }),
      rx(set('e', 'w2', 5, 200, 3), 1, { amrap: true }),
      rx(set('f', 'w2', 6, 50, 12), 8, { prescribedRepsMax: 12 }),
      rx(set('g', 'w3', 7, 50, 13), 8, { prescribedRepsMax: 12 }),
    ])
    expect(prKind(checks.get('c'))).toBeUndefined() // heaviest and an e1RM best, but as prescribed
    expect(prKind(checks.get('d'))).toBeUndefined() // 1+ set, just the 1
    expect(prKind(checks.get('e'))).toBe('e1rm')
    expect(prKind(checks.get('g'))).toBe('reps') // past the top of its range
  })

  it('never badge anything in the first session for an exercise', () => {
    // An nSuns pyramid: every set heavier than the one before.
    const pyramid = [170, 190, 215].map((w, i) => set(`p${i}`, 'first', i, w, 3))
    const checks = prChecks(pyramid)
    expect(pyramid.map((s) => prKind(checks.get(s.id)))).toEqual([undefined, undefined, undefined])
  })
})

describe("last time's notes", () => {
  it("come from the last earlier workout that did the exercise, once each", () => {
    const history = [
      { ...set('1', 'old', 1, 45, 10), note: 'too easy' },
      { ...set('2', 'last', 10, 50, 10), note: 'elbow sore' },
      { ...set('3', 'last', 11, 50, 9), note: 'elbow sore' },
      set('4', 'last', 12, 50, 8),
      { ...set('5', 'today', 20, 50, 10), note: 'fine today' },
    ]
    expect(lastNotes(history, 'db-row', 'today')).toEqual({ at: 10, notes: ['elbow sore'] })
    expect(lastNotes(history.slice(3, 4), 'db-row', 'today')).toBeUndefined()
  })
})
