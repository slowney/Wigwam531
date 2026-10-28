import { describe, expect, it } from 'vitest'
import fixture from './fixtures/nsuns-4day-week.txt?raw'
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { NSUNS_4DAY, NSUNS_4DAY_ROW } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { planSlot, planWeek, warmupSets, type PlanContext, type PlannedSlot } from '../src/engine/plan.ts'
import type { MainSlot } from '../src/engine/program.ts'
import { weekReport } from '../src/engine/render.ts'
import { gymChecks } from '../src/engine/weights.ts'

// Made-up TMs. The real check is comparing the fixture against the nSuns app:
// the T1 lines match it set for set. The T2s are the app's own 3 x 6-8.
const TMS = { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 }

function ctx(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    weekType: 'normal',
    tms: TMS,
    schemes: findScheme,
    ...gymChecks(HOME_GYM, findExercise),
    ...overrides,
  }
}

const weights = (slot: PlannedSlot | undefined) => slot?.sets.map((s) => s.weight)

function slotById(id: string): MainSlot {
  const slot = NSUNS_4DAY_ROW.days.flatMap((d) => d.mains).find((m) => m.id === id)
  if (!slot) throw new Error(`no slot ${id}`)
  return slot
}

describe('nSuns 4-day week', () => {
  it('matches the pinned fixture, every weight of every set', () => {
    const days = planWeek(NSUNS_4DAY, ctx())
    const report = weekReport({ program: NSUNS_4DAY, weekType: 'normal', tms: TMS, days, lookup: findExercise })
    expect(report).toBe(fixture)
  })

  it('has exactly one 1+ progression set per day, on the T1', () => {
    for (const day of planWeek(NSUNS_4DAY, ctx())) {
      const stars = day.mains.flatMap((m) => m.sets.filter((s) => s.progression).map(() => m.tier))
      expect(stars).toEqual(['T1'])
    }
  })

  it("runs T2s off another lift's TM", () => {
    const sumo = planSlot(slotById('d2-t2'), ctx())
    expect(sumo.tmExerciseId).toBe('deadlift')
    expect(sumo.tm).toBe(315)
    const incline = planSlot(slotById('d3-t2'), ctx())
    expect(incline.tmExerciseId).toBe('bench-press')
    expect(weights(incline)?.[0]).toBe(135) // 60% of 225
    expect(incline.warmups.map((s) => s.weight)).toEqual([90, 115]) // 40% and 50%
  })

  it('runs T2s as three sets of 6-8 at the old nSuns top weight', () => {
    const ohp = planSlot(slotById('d1-t2'), ctx())
    expect(ohp.sets.map((s) => [s.weight, s.reps, s.repsMax, s.amrap])).toEqual([
      [95, 6, 8, false],
      [95, 6, 8, false],
      [95, 6, 8, false],
    ])
    // The classic shape is still there to pick.
    const classic = planSlot({ ...slotById('d1-t2'), schemeId: 'nsuns-t2-ohp-classic' }, ctx())
    expect(weights(classic)).toEqual([70, 80, 95, 95, 95, 95, 95, 95])
    expect(classic.warmups).toEqual([])
  })

  it('updates the moment a TM changes, because nothing is stored', () => {
    const before = planSlot(slotById('d1-t1'), ctx())
    const after = planSlot(slotById('d1-t1'), ctx({ tms: { ...TMS, 'bench-press': 230 } }))
    expect(before.sets[2]?.weight).toBe(215)
    expect(after.sets[2]?.weight).toBe(220) // 95% of 230 = 218.5
  })
})

describe('week types', () => {
  it('deloads every percentage slot to 40/50/60 x 5 with no progression', () => {
    const bench = planSlot(slotById('d1-t1'), ctx({ weekType: 'deload' }))
    expect(bench.sets.map((s) => [s.weight, s.reps])).toEqual([
      [90, 5],
      [115, 5],
      [135, 5],
    ])
    expect(bench.sets.some((s) => s.progression || s.amrap)).toBe(false)
  })

  it('tests the TM on slots that drive one and deloads the rest', () => {
    const bench = planSlot(slotById('d1-t1'), ctx({ weekType: 'tmTest' }))
    expect(weights(bench)).toEqual([160, 180, 205, 225])
    expect(bench.sets.map((s) => s.tmTest)).toEqual([false, false, false, true])
    // OHP's T2 slot has no 1+ set, so it rides along as deload work.
    const ohpT2 = planSlot(slotById('d1-t2'), ctx({ weekType: 'tmTest' }))
    expect(weights(ohpT2)).toEqual([55, 70, 80])
  })
})

describe('slots without a TM', () => {
  it('flags a percentage slot whose TM was never entered', () => {
    const bench = planSlot(slotById('d1-t1'), ctx({ tms: {} }))
    expect(bench.missingTm).toBe(true)
    expect(bench.sets).toEqual([])
  })

  it('runs the heavy row by rep range at its working weight', () => {
    const row = planSlot(slotById('d1-t3'), ctx({ workingWeights: { 'barbell-row': 135 } }))
    expect(row.kind).toBe('range')
    expect(row.sets.map((s) => [s.weight, s.reps, s.repsMax])).toEqual(Array(4).fill([135, 6, 8]))
  })

  it('leaves the row weight open when there is no history yet', () => {
    const row = planSlot(slotById('d1-t3'), ctx())
    expect(row.sets.every((s) => s.weight === undefined)).toBe(true)
  })

  it('halves rep-range work in a deload and keeps the weight', () => {
    const row = planSlot(slotById('d1-t3'), ctx({ weekType: 'deload', workingWeights: { 'barbell-row': 135 } }))
    expect(row.sets.map((s) => [s.weight, s.reps, s.repsMax])).toEqual([
      [135, 6, undefined],
      [135, 6, undefined],
    ])
  })
})

describe('the garage plates', () => {
  it('flags sets heavier than one pair of each plate can make', () => {
    const deadlift = planSlot(slotById('d4-t1'), ctx({ tms: { ...TMS, deadlift: 365 } }))
    const flagged = deadlift.sets.filter((s) => s.unloadable).map((s) => s.weight)
    expect(flagged).toEqual([345, 330]) // the 95% and 90% sets; 320 is the ceiling
  })

  it('never prescribes less than the empty bar', () => {
    const ohp = planSlot(slotById('d3-t1'), ctx({ weekType: 'deload', tms: { 'overhead-press': 55 } }))
    expect(weights(ohp)).toEqual([45, 45, 45]) // 40/50/60% of 55 are all under the bar
  })
})

describe('warm-ups', () => {
  it('ramps from the bar to 60% of TM', () => {
    expect(warmupSets(225, 170, 45).map((s) => [s.weight, s.reps])).toEqual([
      [45, 10],
      [90, 5],
      [115, 5],
      [135, 3],
    ])
  })

  it('drops warm-ups within 10 lb of the first working set', () => {
    // 60% of 140 is 85, only 5 lb under the first working set of 90.
    expect(warmupSets(140, 90, 45).map((s) => s.weight)).toEqual([45, 55, 70])
  })

  it('collapses to just the bar for a very light TM', () => {
    const ohp = planSlot(slotById('d3-t1'), ctx({ tms: { 'overhead-press': 65 } }))
    expect(ohp.warmups.map((s) => [s.weight, s.reps])).toEqual([[45, 10]])
  })

  it('skips the bar set when the first working set is the bar', () => {
    expect(warmupSets(55, 45, 45)).toEqual([])
  })

  it("gives T1s the full warm-up and T2s their scheme's short ramp", () => {
    const days = planWeek(NSUNS_4DAY, ctx())
    for (const slot of days.flatMap((d) => d.mains)) {
      if (slot.tier === 'T1') expect(slot.warmups[0]).toMatchObject({ weight: 45, reps: 10 })
      else expect(slot.warmups.length).toBeGreaterThanOrEqual(1)
      if (slot.tier === 'T2') expect(slot.warmups.length).toBeLessThanOrEqual(2)
    }
  })

  it("drops ramp sets at the bar or close to the working weight", () => {
    // Squat TM 135: 35% is 45 (the bar), 45% is 60, working weight 55% is 75.
    const front = planSlot(slotById('d4-t2'), ctx({ tms: { squat: 135 } }))
    expect(weights(front)?.[0]).toBe(75)
    expect(front.warmups.map((s) => [s.weight, s.reps])).toEqual([[60, 3]])
  })

  it('leaves the ramp out of deload and TM-test weeks', () => {
    expect(planSlot(slotById('d1-t2'), ctx({ weekType: 'deload' })).warmups).toEqual([])
    expect(planSlot(slotById('d1-t2'), ctx({ weekType: 'tmTest' })).warmups).toEqual([])
  })

  it('swaps the ramp for the full warm-up when the slot asks for one', () => {
    const ohp = planSlot({ ...slotById('d1-t2'), warmups: true }, ctx())
    expect(ohp.warmups.map((s) => s.weight)).toEqual([45, 55, 70, 80])
  })
})
