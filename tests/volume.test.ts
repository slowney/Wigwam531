import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { NSUNS_4DAY } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { planDay, planWeek } from '../src/engine/plan.ts'
import { combine, loggedVolume, plannedVolume } from '../src/engine/volume.ts'
import { gymChecks } from '../src/engine/weights.ts'

const ctx = {
  weekType: 'normal' as const,
  tms: { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 },
  schemes: findScheme,
  ...gymChecks(HOME_GYM, findExercise),
}

describe('muscle volume', () => {
  it('counts working sets, primary 1 and secondary 0.5, and skips warm-ups', () => {
    const bench = [
      ...Array(4).fill({ exerciseId: 'bench-press', warmup: true }),
      ...Array(9).fill({ exerciseId: 'bench-press', warmup: false }),
    ]
    expect(loggedVolume(bench, findExercise)).toEqual({ chest: 9, triceps: 4.5, frontDelts: 4.5 })
  })

  it('projects a stock nSuns week: pressing and legs covered, pulling empty', () => {
    const week = plannedVolume(planWeek(NSUNS_4DAY, ctx), findExercise)
    expect(week.chest).toBe(12) // 9 bench + 3 incline
    expect(week.frontDelts).toBe(18) // 9 + 3 OHP, plus half of 9 bench and 3 incline
    expect(week.hamstrings).toBe(6) // half of 9 deadlift and 3 sumo
    expect(week.biceps).toBeUndefined()
    expect(week.lats).toBeUndefined()
    expect(week.rearDelts).toBeUndefined()
  })

  it('counts pinned accessories at their default sets but not open slots', () => {
    const day = NSUNS_4DAY.days[0]!
    const withRow = { ...day, accessories: [{ id: 'x', kind: 'pinned' as const, exerciseId: 'barbell-row' }] }
    expect(plannedVolume([planDay(withRow, ctx)], findExercise).upperBack).toBe(4)
    expect(plannedVolume([planDay(day, ctx)], findExercise).upperBack).toBeUndefined()
  })

  it('adds logged and planned volume together', () => {
    expect(combine({ chest: 9 }, { chest: 8, lats: 3 })).toEqual({ chest: 17, lats: 3 })
  })
})
