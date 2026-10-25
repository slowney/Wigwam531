import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { FIVE_THREE_ONE_BBB, FIVE_THREE_ONE_BBS, NSUNS_4DAY } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { createProfile } from '../src/db/profiles.ts'
import { loadWeekReview, startWeeks } from '../src/db/weeks.ts'
import { planSlot, waveIndex, type PlanContext } from '../src/engine/plan.ts'
import { cycleResults, cycleStep, proposeTmChanges, UPPER_TABLE } from '../src/engine/progression.ts'
import { doWorkout, freshDb } from './helpers.ts'

const TMS = { 'bench-press': 200, squat: 300, 'overhead-press': 100, deadlift: 400 }
const ctx = (waveIndex: number, weekType: PlanContext['weekType'] = 'normal'): PlanContext => ({
  weekType,
  waveIndex,
  tms: TMS,
  schemes: findScheme,
})
const benchDay = (program: typeof FIVE_THREE_ONE_BBB) => program.days.find((d) => d.mains[0]!.exerciseId === 'bench-press')!

describe('5/3/1 waves', () => {
  it('count normal weeks since the last deload or TM test', () => {
    const weeks = ['normal', 'normal', 'deload', 'normal', 'normal', 'normal'].map((type, i) => ({
      number: i + 1,
      type: type as 'normal' | 'deload',
    }))
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => waveIndex(weeks, n))).toEqual([0, 1, 2, 0, 1, 2, 3])
  })

  it('run 5s, 3s and 5/3/1 weeks, each ending on a 1+ set', () => {
    const slot = benchDay(FIVE_THREE_ONE_BBB).mains[0]!
    const weights = [0, 1, 2, 3].map((w) => planSlot(slot, ctx(w)).sets.map((s) => `${s.weight}x${s.reps}${s.amrap ? '+' : ''}`))
    expect(weights).toEqual([
      ['130x5', '150x5', '170x5+'],
      ['140x3', '160x3', '180x3+'],
      ['150x5', '170x3', '190x1+'],
      ['130x5', '150x5', '170x5+'],
    ])
    expect(planSlot(slot, ctx(1)).wave).toBe('3s week')
    // A TM-test week tests the TM a cycle runs.
    expect(planSlot(slot, ctx(1, 'tmTest')).sets.some((s) => s.tmTest)).toBe(true)
  })

  it('put BBB at 5 × 10 at 50%, and BBS at 10 × 5 at the first set of the week', () => {
    const bbb = planSlot(benchDay(FIVE_THREE_ONE_BBB).mains[1]!, ctx(2)).sets
    expect(bbb.map((s) => `${s.weight}x${s.reps}`)).toEqual(Array(5).fill('100x10'))
    const bbs = [0, 1, 2].map((w) => planSlot(benchDay(FIVE_THREE_ONE_BBS).mains[1]!, ctx(w)).sets)
    expect(bbs.map((sets) => [sets.length, sets[0]!.weight])).toEqual([
      [10, 130],
      [10, 140],
      [10, 150],
    ])
  })
})

describe('5/3/1 progression', () => {
  const set = (exerciseId: string, reps: number, prescribedReps: number) => ({
    exerciseId,
    amrap: true,
    warmup: false,
    reps,
    prescribedReps,
  })

  it('moves a TM only at the end of a cycle, and only if every 1+ set made its reps', () => {
    expect(cycleResults(FIVE_THREE_ONE_BBB, findScheme, 1, [set('bench-press', 5, 3)])['bench-press']).toEqual({
      last: false,
      made: true,
    })
    const end = cycleResults(FIVE_THREE_ONE_BBB, findScheme, 2, [set('bench-press', 3, 1), set('squat', 0, 1)])
    expect(end).toMatchObject({ 'bench-press': { last: true, made: true }, squat: { last: true, made: false } })
    expect(end['deadlift']).toEqual({ last: true, made: undefined })
    // nSuns lifts are left to their weekly ★ sets.
    expect(cycleResults(NSUNS_4DAY, findScheme, 2, [])).toEqual({})

    const proposals = proposeTmChanges({
      weekType: 'normal',
      tms: TMS,
      results: {},
      previous: {},
      tables: () => UPPER_TABLE,
      cycles: { ...end, 'overhead-press': { last: false, made: true } },
      cycleStep: (id) => cycleStep(findExercise(id)?.region ?? 'upper'),
    })
    expect(Object.fromEntries(proposals.map((p) => [p.exerciseId, [p.reason, p.proposed]]))).toEqual({
      'bench-press': ['cycle', 205],
      squat: ['cycleMissed', 300],
      'overhead-press': ['midCycle', 100],
      deadlift: ['skipped', 400],
    })
  })

  it('runs a whole cycle in the app: TMs hold for two weeks, then step up', async () => {
    const db = freshDb()
    const id = await createProfile(
      { name: 'Wave', color: '#000', program: { kind: 'preset', presetId: '531-bbb-4day' }, tms: TMS, ratingPreset: 'blank' },
      db,
    )
    let clock = 1_000
    for (let week = 1; week <= 3; week++) {
      for (const dayId of ['d1', 'd2', 'd3', 'd4']) await doWorkout(db, [{ profileId: id, dayId }], (clock += 1_000))
      const review = (await loadWeekReview(id, db))!
      const bench = review.proposals.find((p) => p.exerciseId === 'bench-press')!
      if (week < 3) {
        expect(bench.reason).toBe('midCycle')
      } else {
        expect(review.proposals.map((p) => [p.exerciseId, p.proposed - p.current])).toEqual(
          expect.arrayContaining([
            ['bench-press', 5],
            ['squat', 10],
            ['overhead-press', 5],
            ['deadlift', 10],
          ]),
        )
      }
      await startWeeks(
        [{ profileId: id, type: 'normal', tms: review.proposals.map((p) => ({ exerciseId: p.exerciseId, lb: p.proposed, reason: 'progression' })) }],
        db,
        (clock += 1_000),
      )
    }
  })
})
