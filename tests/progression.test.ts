import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import {
  LOWER_TABLE,
  UPPER_TABLE,
  defaultTable,
  increaseFor,
  nextWorkingWeight,
  proposeTmChanges,
  type ProposalInput,
  type TmProposal,
} from '../src/engine/progression.ts'
import { nextLoad } from '../src/engine/weights.ts'

describe('the nSuns progression table', () => {
  it.each([
    [0, 0, 0],
    [1, 0, 0],
    [2, 5, 5],
    [3, 5, 5],
    [4, 5, 10],
    [5, 5, 10],
    [6, 10, 15],
    [10, 10, 15],
    [15, 10, 15],
  ])('%i reps on the 1+ set: upper +%i, lower +%i', (reps, upper, lower) => {
    expect(increaseFor(reps, UPPER_TABLE)).toBe(upper)
    expect(increaseFor(reps, LOWER_TABLE)).toBe(lower)
  })
})

const TMS = { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 }

function propose(overrides: Partial<ProposalInput>): Record<string, TmProposal> {
  const proposals = proposeTmChanges({
    weekType: 'normal',
    tms: TMS,
    results: {},
    previous: {},
    tables: (id) => defaultTable(findExercise(id)?.region ?? 'upper'),
    ...overrides,
  })
  return Object.fromEntries(proposals.map((p) => [p.exerciseId, p]))
}

describe('Start Week TM proposals', () => {
  it('bumps each lift from its own 1+ set', () => {
    const p = propose({ results: { 'bench-press': 4, squat: 6 } })
    expect(p['bench-press']).toMatchObject({ proposed: 230, reason: 'progression', reps: 4 })
    expect(p['squat']).toMatchObject({ proposed: 290, reason: 'progression', reps: 6 })
  })

  it('holds a lift whose day was skipped', () => {
    const p = propose({ results: { 'bench-press': 4 } })
    expect(p['deadlift']).toMatchObject({ proposed: 315, reason: 'skipped' })
  })

  it('offers a 10% reset after two stalls, without applying it', () => {
    const p = propose({ results: { 'overhead-press': 1 }, previous: { 'overhead-press': 0 } })
    expect(p['overhead-press']).toMatchObject({ proposed: 135, reason: 'stall', resetTo: 120 })
  })

  it('does not call one bad week a stall', () => {
    const p = propose({ results: { 'overhead-press': 1 }, previous: { 'overhead-press': 3 } })
    expect(p['overhead-press']).toMatchObject({ proposed: 135, reason: 'progression' })
    expect(p['overhead-press']?.resetTo).toBeUndefined()
  })

  it('does not call a first-ever bad week a stall', () => {
    const p = propose({ results: { 'overhead-press': 0 } })
    expect(p['overhead-press']?.reason).toBe('progression')
  })

  it('holds everything after a deload', () => {
    const p = propose({ weekType: 'deload', results: { 'bench-press': 8 } })
    expect(Object.values(p).map((x) => [x.proposed, x.reason])).toEqual(
      Object.values(TMS).map((tm) => [tm, 'deload']),
    )
  })

  it('keeps a TM that passes its test and lowers one that fails', () => {
    const p = propose({ weekType: 'tmTest', results: { 'bench-press': 4, squat: 2 } })
    expect(p['bench-press']).toMatchObject({ proposed: 225, reason: 'tmTestPassed' })
    expect(p['squat']).toMatchObject({ proposed: 250, reason: 'tmTestFailed' }) // 90% of 275 = 247.5
  })
})

describe('double progression', () => {
  const barbell = (w: number) => nextLoad(w, 'barbell', HOME_GYM)
  const dumbbell = (w: number) => nextLoad(w, 'dumbbell', HOME_GYM)
  const sets = (weight: number, reps: number[]) => reps.map((r) => ({ weight, reps: r }))

  it('waits for a first session before suggesting a weight', () => {
    expect(nextWorkingWeight([], [6, 8], 4, barbell)).toEqual({ reason: 'start' })
  })

  it('steps up once every set reaches the top of the range', () => {
    expect(nextWorkingWeight(sets(135, [8, 8, 8, 8]), [6, 8], 4, barbell)).toEqual({ weight: 140, reason: 'increase' })
  })

  it('holds while any set is short', () => {
    expect(nextWorkingWeight(sets(135, [8, 8, 7, 8]), [6, 8], 4, barbell)).toEqual({ weight: 135, reason: 'hold' })
  })

  it('holds when fewer sets were done than the scheme asks for', () => {
    expect(nextWorkingWeight(sets(135, [8, 8, 8]), [6, 8], 4, barbell)).toEqual({ weight: 135, reason: 'hold' })
  })

  it('ignores a lighter back-off set', () => {
    const session = [...sets(135, [8, 8, 8, 8]), { weight: 115, reps: 12 }]
    expect(nextWorkingWeight(session, [6, 8], 4, barbell)).toEqual({ weight: 140, reason: 'increase' })
  })

  it('moves to the next dumbbell pair', () => {
    expect(nextWorkingWeight(sets(35, [12, 12, 12]), [8, 12], 3, dumbbell)).toEqual({ weight: 40, reason: 'increase' })
  })

  it('holds at the 55s, the heaviest dumbbells in the garage', () => {
    expect(nextWorkingWeight(sets(55, [12, 12, 12]), [8, 12], 3, dumbbell)).toEqual({ weight: 55, reason: 'maxed' })
  })
})
