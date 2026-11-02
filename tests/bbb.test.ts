import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { FIVE_THREE_ONE_BBB, FIVE_THREE_ONE_BBS } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { planSlot, weeksRunKey, type PlanContext } from '../src/engine/plan.ts'
import type { MainSlot, Program } from '../src/engine/program.ts'
import { overrideDiff } from '../src/engine/programEdit.ts'
import { schemeShape } from '../src/engine/schemes.ts'
import { applySwaps, normalWeekIds, planEntry, weeksRun } from '../src/engine/session.ts'

// Made-up TMs.
const TMS = { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 }
const ctx = (overrides: Partial<PlanContext> = {}): PlanContext => ({
  weekType: 'normal',
  tms: TMS,
  schemes: findScheme,
  ...overrides,
})
const bbbDay = (program: Program, id: string) => program.days.find((d) => d.id === id)!
const ohpBbb = bbbDay(FIVE_THREE_ONE_BBB, 'd1').mains[1]!

describe('BBB variations', () => {
  it('come with every BBB and BBS supplemental slot, all doable in the garage', () => {
    for (const program of [FIVE_THREE_ONE_BBB, FIVE_THREE_ONE_BBS]) {
      for (const day of program.days) {
        const alternates = day.mains[1]!.alternates ?? []
        expect(alternates.length).toBeGreaterThan(1)
        for (const id of alternates) {
          const e = findExercise(id)
          expect(e, id).toBeDefined()
          expect(e!.equipment.every((x) => HOME_GYM.equipment.includes(x)), id).toBe(true)
        }
      }
    }
    expect(bbbDay(FIVE_THREE_ONE_BBB, 'd4').mains[1]!.alternates).toContain('heels-elevated-squat')
  })

  it('keep the 5 x 10 when swapped in without a TM, at a weight you pick', () => {
    const day = applySwaps(bbbDay(FIVE_THREE_ONE_BBB, 'd1'), { 'd1-t2': 'db-overhead-press' }, (id) => id in TMS, findExercise, findScheme)
    const slot = day.mains[1]!
    expect(slot).toMatchObject({ exerciseId: 'db-overhead-press', schemeId: 'range-5x10-10', alternates: ohpBbb.alternates })
    const planned = planSlot(slot, ctx())
    // A range of one rep count is just "10", not "10-10".
    expect(planned.sets.map((s) => [s.weight, s.reps, s.repsMax])).toEqual(Array(5).fill([undefined, 10, undefined]))
  })

  it('only keep a shape the scheme has: a pyramid falls back to the lift’s own range', () => {
    expect(schemeShape(findScheme('531-bbb')!)).toEqual({ sets: 5, reps: [10, 10] })
    expect(schemeShape(findScheme('nsuns-t2-ohp')!)).toEqual({ sets: 3, reps: [6, 8] })
    expect(schemeShape(findScheme('nsuns-t1-bench')!)).toBeUndefined()
    expect(schemeShape(findScheme('531-main')!)).toBeUndefined() // ends on a 1+ set
  })

  it('carry the dumbbell weight over, and say when the heaviest pair is outgrown', () => {
    const logged = (weight: number, reps: number[]) =>
      reps.map((r, i) => ({
        id: `s${weight}-${i}`,
        exerciseId: 'db-overhead-press',
        sessionId: `last-${weight}`,
        weight,
        reps: r,
        warmup: false,
        at: weight * 10 + i,
      }))
    const plan = (history: ReturnType<typeof logged>) =>
      planEntry({
        program: FIVE_THREE_ONE_BBB,
        dayId: 'd1',
        swaps: { 'd1-t2': 'db-overhead-press' },
        accessories: [],
        weekType: 'normal',
        tms: TMS,
        history,
        sessionId: 'today',
        gym: HOME_GYM,
        lookup: findExercise,
        schemes: findScheme,
      })!.slots[1]!
    // Per hand, as the dumbbells are numbered: 10 on every set moves 40s to 45s.
    expect(plan(logged(40, [10, 10, 10, 10, 10]))).toMatchObject({ carried: { reason: 'increase', weight: 45 } })
    expect(plan(logged(40, [10, 10, 10, 9, 8]))).toMatchObject({ carried: { reason: 'hold', weight: 40 } })
    expect(plan(logged(55, [10, 10, 10, 10, 10]))).toMatchObject({ carried: { reason: 'maxed', weight: 55 } })
  })

  it('are a follower’s own change only when theirs differ from the leader’s', () => {
    expect(overrideDiff(ohpBbb, { ...ohpBbb })).toEqual({})
    const mine: MainSlot = { ...ohpBbb, alternates: ['db-overhead-press'] }
    expect(overrideDiff(ohpBbb, mine)).toMatchObject({ alternates: ['db-overhead-press'] })
  })
})

describe('the BBB build-up', () => {
  const slot: MainSlot = { ...ohpBbb, schemeId: '531-bbb-build' }
  const at = (weeks: number) =>
    planSlot(slot, ctx({ weeksRun: { [weeksRunKey('531-bbb-build', 'overhead-press')]: weeks } }))

  it('runs 30%, then 45%, then 60% for good, a cycle of three weeks each', () => {
    const pcts = [0, 2, 3, 5, 6, 30].map((w) => at(w).sets[0]?.pct)
    expect(pcts).toEqual([30, 30, 45, 45, 60, 60])
    expect(at(0).sets).toHaveLength(5)
    expect(at(0).sets.every((s) => s.reps === 10)).toBe(true)
    expect(at(0).sets[0]?.weight).toBe(40) // 30% of 135
  })

  it('says where it is until it reaches the last step', () => {
    expect(at(0).wave).toBe('Build-up 1 of 3')
    expect(at(4).wave).toBe('Build-up 2 of 3')
    expect(at(6).wave).toBeUndefined()
  })

  it('counts the normal weeks a lift ran the scheme, not this one, deloads or swaps', () => {
    const weeks = [
      { id: 'w1', type: 'normal' as const },
      { id: 'w2', type: 'normal' as const },
      { id: 'w3', type: 'deload' as const },
      { id: 'w4', type: 'normal' as const },
    ]
    const s = (id: string, weekId: string, schemeId: string | undefined, exerciseId = 'overhead-press', warmup = false) => ({
      id,
      exerciseId,
      sessionId: weekId,
      weekId,
      schemeId,
      weight: 40,
      reps: 10,
      warmup,
      at: 1,
    })
    const history = [
      s('a', 'w1', '531-bbb-build'),
      s('b', 'w1', '531-bbb-build'), // same week twice counts once
      s('c', 'w2', 'range-5x10-10', 'db-overhead-press'), // a dumbbell week
      s('d', 'w3', '531-bbb-build'), // a deload
      s('e', 'w4', '531-bbb-build', 'overhead-press', true), // only a warm-up
      s('f', 'w4', '531-bbb-build'), // this week
      s('g', 'w1', undefined), // logged before scheme ids were kept
    ]
    expect(weeksRun(history, normalWeekIds(weeks), 'w4')).toEqual({
      [weeksRunKey('531-bbb-build', 'overhead-press')]: 1,
      [weeksRunKey('range-5x10-10', 'db-overhead-press')]: 1,
    })
  })
})
