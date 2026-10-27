import { describe, expect, it } from 'vitest'
import { EXERCISES, findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { FIVE_THREE_ONE_BBB, NSUNS_4DAY } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { DEFAULT_TARGETS } from '../src/data/targets.ts'
import { rankGroups } from '../src/engine/groups.ts'
import { planWeek, type PlanContext } from '../src/engine/plan.ts'
import { dayFocus, focusMuscles } from '../src/engine/program.ts'
import { setDayFocus } from '../src/engine/programEdit.ts'
import { behind, fillSlots, suggest, type SuggestInput } from '../src/engine/suggest.ts'
import type { Muscle } from '../src/engine/types.ts'
import { plannedVolume } from '../src/engine/volume.ts'
import { gymChecks } from '../src/engine/weights.ts'

const ctx: PlanContext = {
  weekType: 'normal',
  tms: { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 },
  schemes: findScheme,
  ...gymChecks(HOME_GYM, findExercise),
}
const stockWeek = plannedVolume(planWeek(NSUNS_4DAY, ctx), findExercise)

const base = (day: SuggestInput['day']): SuggestInput => ({
  exercises: EXERCISES,
  ratings: new Map(),
  equipment: new Set(HOME_GYM.equipment),
  restrictions: [],
  gaps: behind(stockWeek, DEFAULT_TARGETS, undefined, day ? focusMuscles(day) : undefined),
  exclude: new Set(),
  lastDone: new Map(),
  sort: 'rating',
  day,
})

const primaries = (id: string) =>
  Object.entries(findExercise(id)!.muscles)
    .filter(([, w]) => w === 1)
    .map(([m]) => m as Muscle)

describe('day focus', () => {
  it('comes from the first main lift: squat lower, deadlift posterior, presses upper', () => {
    expect(NSUNS_4DAY.days.map((d) => dayFocus(d, findExercise))).toEqual(['upper', 'lower', 'upper', 'posterior'])
    expect(FIVE_THREE_ONE_BBB.days.map((d) => dayFocus(d, findExercise))).toEqual(['upper', 'posterior', 'upper', 'lower'])
    expect(dayFocus({ id: 'x', name: 'Day 5', mains: [], accessories: [] }, findExercise)).toBe('full')
  })

  it('can be set by hand, and cleared back to automatic', () => {
    const set = setDayFocus(NSUNS_4DAY, 'd2', 'posterior')
    expect(dayFocus(set.days[1]!, findExercise)).toBe('posterior')
    expect(dayFocus(setDayFocus(set, 'd2', undefined).days[1]!, findExercise)).toBe('lower')
  })

  it("puts the day's behind muscles first, a focus muscle leading only where it fits", () => {
    const lower = behind(stockWeek, DEFAULT_TARGETS, { extras: { chest: 3 }, accessory: {} }, focusMuscles('lower'))
    const fitting = lower.filter((g) => g.fitsDay).map((g) => g.muscle)
    expect(lower.slice(0, fitting.length).map((g) => g.muscle)).toEqual(fitting)
    expect(fitting).toEqual(expect.arrayContaining(['hamstrings', 'abs', 'calves']))
    // Chest is a focus but not a squat-day muscle: it waits behind them.
    expect(lower.findIndex((g) => g.muscle === 'chest')).toBeGreaterThanOrEqual(fitting.length)
  })

  it('fills a lower day with leg work while legs are behind', () => {
    const input = base('lower')
    const picks = fillSlots({ ...input, projected: stockWeek, targets: DEFAULT_TARGETS, day: 'lower' }, 3)
    const legs = new Set(focusMuscles('lower'))
    for (const e of picks) expect(primaries(e.id).some((m) => legs.has(m))).toBe(true)
  })

  it('fills a posterior day with back and pull work, and keeps it off the lower back', () => {
    const input = base('posterior')
    const picks = fillSlots({ ...input, projected: stockWeek, targets: DEFAULT_TARGETS, day: 'posterior' }, 3)
    const posterior = new Set(focusMuscles('posterior'))
    for (const e of picks) {
      expect(primaries(e.id).some((m) => posterior.has(m))).toBe(true)
      expect(e.lowerBack).toBeUndefined()
    }
    // Among back work, rows that load the lower back come after ones that don't.
    const back = suggest({ ...input, only: 'upperBack' })
    const firstHeavy = back.findIndex((s) => s.backHeavy)
    expect(firstHeavy === -1 || back.slice(firstHeavy).every((s) => s.backHeavy)).toBe(true)
  })

  it('ranks groups that fit the day higher', () => {
    const groups = [
      { id: 'arms', name: 'Arms', items: [{ exerciseId: 'db-curl', sets: 3, reps: [8, 12] as [number, number] }] },
      { id: 'legs', name: 'Legs', items: [{ exerciseId: 'goblet-squat', sets: 3, reps: [8, 12] as [number, number] }] },
    ]
    expect(rankGroups(groups, [], [], findExercise, focusMuscles('lower'))[0]!.group.id).toBe('legs')
    expect(rankGroups(groups, [], [], findExercise, focusMuscles('upper'))[0]!.group.id).toBe('arms')
  })
})
