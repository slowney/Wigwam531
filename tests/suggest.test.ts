import { describe, expect, it } from 'vitest'
import { EXERCISES, findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { NSUNS_4DAY } from '../src/data/presets.ts'
import { RESTRICTION_PRESETS } from '../src/data/restrictionPresets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { DEFAULT_TARGETS } from '../src/data/targets.ts'
import { planDay, planWeek, type PlanContext } from '../src/engine/plan.ts'
import {
  activeRestrictions,
  behind,
  fillSlots,
  focusExtras,
  search,
  suggest,
  type SuggestInput,
} from '../src/engine/suggest.ts'
import type { Equipment, Muscle, Rating, Restriction, Stars } from '../src/engine/types.ts'
import { plannedVolume, projectedWeek } from '../src/engine/volume.ts'
import { gymChecks } from '../src/engine/weights.ts'

const ctx: PlanContext = {
  weekType: 'normal',
  tms: { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 },
  schemes: findScheme,
  ...gymChecks(HOME_GYM, findExercise),
}

// A stock nSuns 4-day week with no accessories at all.
const stockWeek = plannedVolume(planWeek(NSUNS_4DAY, ctx), findExercise)
const stockGaps = behind(stockWeek, DEFAULT_TARGETS)

const ratings = (entries: Record<string, Stars | 'hidden'>): Map<string, Rating> =>
  new Map(
    Object.entries(entries).map(([exerciseId, r]) => [
      exerciseId,
      r === 'hidden' ? { exerciseId, hidden: true } : { exerciseId, stars: r, hidden: false },
    ]),
  )

function input(overrides: Partial<SuggestInput> = {}): SuggestInput {
  return {
    exercises: EXERCISES,
    ratings: new Map(),
    equipment: new Set(HOME_GYM.equipment),
    restrictions: [],
    gaps: stockGaps,
    exclude: new Set(),
    lastDone: new Map(),
    sort: 'rating',
    ...overrides,
  }
}

const ids = (list: { exercise: { id: string } }[]) => list.map((s) => s.exercise.id)
const preset = (id: string): Restriction => ({ id, ...RESTRICTION_PRESETS.find((p) => p.id === id)!.rule })

describe('what a stock nSuns week leaves behind', () => {
  it('is back, rear delts, biceps, calves and hamstrings, never pressing or legs', () => {
    expect(stockGaps.map((g) => g.muscle)).toEqual([
      'lats',
      'rearDelts',
      'biceps',
      'calves',
      'abs',
      'sideDelts',
      'hamstrings',
    ])
    for (const covered of ['chest', 'quads', 'glutes', 'frontDelts', 'triceps'] as Muscle[]) {
      expect(stockGaps.map((g) => g.muscle)).not.toContain(covered)
    }
  })

  it('adds up to about what three slots a day can fill', () => {
    const total = stockGaps.reduce((sum, g) => sum + g.gap, 0)
    expect(total).toBe(37) // 12 accessories at 3 sets is 36
  })
})

describe('suggestions', () => {
  it('only include exercises with a behind muscle as a primary mover', () => {
    const list = suggest(input())
    expect(list.length).toBeGreaterThan(10)
    expect(ids(list)).not.toContain('db-bench-press')
    expect(ids(list)).not.toContain('goblet-squat')
    expect(list.every((s) => s.hits.length > 0)).toBe(true)
  })

  it('put every 5-star exercise above every 3-star one', () => {
    const list = suggest(
      input({ ratings: ratings({ 'straight-arm-pulldown': 5, 'face-pull': 5, 'pull-up': 2 }) }),
    )
    const firstThree = list.findIndex((s) => s.stars === 3)
    const lastFive = list.map((s) => s.stars).lastIndexOf(5)
    expect(lastFive).toBeLessThan(firstThree)
    expect(list.at(-1)?.stars).toBe(2)
  })

  it('narrow to one muscle when its chip is tapped', () => {
    const list = suggest(input({ only: 'biceps' }))
    expect(list.every((s) => s.exercise.muscles.biceps === 1)).toBe(true)
    expect(ids(list)).toContain('hammer-curl')
  })

  it('never show hidden exercises or ones the gym can\'t do', () => {
    const noCable = new Set<Equipment>(HOME_GYM.equipment.filter((e) => e !== 'cable'))
    const list = suggest(input({ equipment: noCable, ratings: ratings({ 'pull-up': 'hidden' }) }))
    expect(ids(list)).not.toContain('pull-up')
    expect(list.some((s) => s.exercise.load === 'cable')).toBe(false)
  })

  it("leave out what's already in today's plan", () => {
    expect(ids(suggest(input({ exclude: new Set(['face-pull']) })))).not.toContain('face-pull')
  })

  it('can rank by fit instead, coverage weighted by rating', () => {
    // Straight-arm pulldowns hit lats only; chin-ups hit lats and biceps.
    const gaps = stockGaps.filter((g) => g.muscle === 'lats' || g.muscle === 'biceps')
    const rated = ratings({ 'straight-arm-pulldown': 4 })
    const byRating = ids(suggest(input({ gaps, ratings: rated })))
    const byFit = ids(suggest(input({ gaps, ratings: rated, sort: 'fit' })))
    expect(byRating.indexOf('straight-arm-pulldown')).toBeLessThan(byRating.indexOf('chin-up'))
    expect(byFit.indexOf('chin-up')).toBeLessThan(byFit.indexOf('straight-arm-pulldown'))
  })

  it("break a tie with whatever was done longest ago", () => {
    const gaps = stockGaps.filter((g) => g.muscle === 'calves')
    const lastDone = new Map([
      ['standing-db-calf-raise', 300],
      ['seated-db-calf-raise', 100],
      ['barbell-calf-raise', 200],
    ])
    expect(ids(suggest(input({ gaps, lastDone })))).toEqual([
      'seated-db-calf-raise',
      'barbell-calf-raise',
      'standing-db-calf-raise',
    ])
  })

  it('search the whole library when typing, gaps or not', () => {
    const found = ids(search(input({ ratings: ratings({ 'ez-curl': 5, 'db-curl': 'hidden' }) }), 'curl'))
    expect(found[0]).toBe('ez-curl')
    expect(found).toContain('db-wrist-curl')
    expect(found).not.toContain('db-curl')
  })
})

describe('restrictions', () => {
  const everything = behind({}, DEFAULT_TARGETS)
  const allowed = (r: Restriction) => ids(suggest(input({ gaps: everything, restrictions: [r] })))

  it('for the lower back remove hinges and bent-over rows, and keep supported work', () => {
    const list = allowed(preset('lower-back'))
    for (const gone of [
      'romanian-deadlift',
      'db-rdl',
      'good-morning',
      'kettlebell-swing',
      'trap-bar-deadlift',
      'barbell-row',
      'pendlay-row',
      'landmine-t-bar-row',
      'meadows-row',
    ]) {
      expect(list, gone).not.toContain(gone)
    }
    for (const kept of ['chest-supported-db-row', 'barbell-hip-thrust', 'seated-cable-row', 'lat-pulldown']) {
      expect(list, kept).toContain(kept)
    }
  })

  it('for knees remove squats and lunges, and keep hinges', () => {
    const list = allowed(preset('knees'))
    for (const gone of ['goblet-squat', 'bulgarian-split-squat', 'db-walking-lunge', 'db-step-up', 'cossack-squat']) {
      expect(list, gone).not.toContain(gone)
    }
    expect(list).toContain('barbell-hip-thrust')
  })

  it('for overhead pressing keep the landmine press and dips', () => {
    const list = allowed(preset('overhead'))
    for (const gone of ['db-shoulder-press', 'arnold-press', 'overhead-cable-extension', 'overhead-db-extension']) {
      expect(list, gone).not.toContain(gone)
    }
    expect(list).toContain('landmine-press')
    expect(list).toContain('dips')
  })

  it('for elbows remove arm work but keep pulls that only use the arms secondarily', () => {
    const list = allowed(preset('elbows'))
    for (const gone of ['db-curl', 'hammer-curl', 'triceps-pushdown', 'ez-skull-crusher', 'close-grip-bench-press']) {
      expect(list, gone).not.toContain(gone)
    }
    expect(list).toContain('lat-pulldown')
  })

  it('stop applying once they run out', () => {
    const r = [
      { ...preset('knees'), until: 1_000 },
      { ...preset('elbows'), until: undefined },
    ]
    expect(activeRestrictions(r, 500).map((x) => x.id)).toEqual(['knees', 'elbows'])
    expect(activeRestrictions(r, 1_000).map((x) => x.id)).toEqual(['elbows'])
  })
})

describe('Fill all', () => {
  const primaries = (list: { muscles: Partial<Record<Muscle, number>> }[]) =>
    list.map((e) => Object.entries(e.muscles).filter(([, w]) => w === 1).map(([m]) => m))
  const fill = (overrides: Partial<SuggestInput> = {}, targets = DEFAULT_TARGETS, usedToday: Muscle[] = []) =>
    primaries(fillSlots({ ...input(overrides), projected: stockWeek, targets, usedToday }, 3))

  it('spreads three slots across the three biggest gaps', () => {
    const [first, second, third] = fill()
    expect(first).toContain('lats')
    expect(second).toContain('rearDelts')
    // Chin-ups and the like shave the biceps gap below the lats gap, and
    // it still gets the third slot: a muscle doesn't get two slots while
    // another gap has none.
    expect(third).toContain('biceps')
  })

  it('counts accessories already picked today', () => {
    expect(fill({}, DEFAULT_TARGETS, ['lats'])[0]).toContain('rearDelts')
  })

  it('gives a gap a second slot once every gap has one', () => {
    const onlyBack = { ...DEFAULT_TARGETS, biceps: 0, calves: 0, abs: 0, sideDelts: 0, hamstrings: 0 }
    const [first, second, third] = fill({}, onlyBack)
    expect([first, second, third].map((m) => m?.includes('lats'))).toEqual([true, false, true])
    expect(second).toContain('rearDelts')
  })

  it('takes your top-rated exercise for each gap', () => {
    const picks = fillSlots(
      {
        ...input({ ratings: ratings({ 'chin-up': 5, 'face-pull': 5, 'hammer-curl': 5 }) }),
        projected: stockWeek,
        targets: DEFAULT_TARGETS,
      },
      3,
    )
    expect(picks.map((e) => e.id)).toEqual(['chin-up', 'face-pull', 'hammer-curl'])
  })

  it('passes over a gap with nothing usable left for it', () => {
    const noLats = Object.fromEntries(
      EXERCISES.filter((e) => e.muscles.lats === 1).map((e) => [e.id, 'hidden' as const]),
    )
    expect(fill({ ratings: ratings(noLats) })[0]).toContain('rearDelts')
  })
})

describe('a focus', () => {
  const primaries = (list: { muscles: Partial<Record<Muscle, number>> }[]) =>
    list.map((e) => Object.entries(e.muscles).filter(([, w]) => w === 1).map(([m]) => m))

  it('surfaces muscles the main lifts already cover, ahead of everything else', () => {
    const gaps = behind(stockWeek, DEFAULT_TARGETS, { extras: { chest: 3, frontDelts: 3, triceps: 3 }, accessory: {} })
    expect(gaps.slice(0, 3).map((g) => [g.muscle, g.kind, g.have, g.target])).toEqual([
      ['chest', 'focus', 0, 3],
      ['frontDelts', 'focus', 0, 3],
      ['triceps', 'focus', 0, 3],
    ])
    expect(gaps[3]?.muscle).toBe('lats') // the usual gaps follow
  })

  it('is met by accessory sets, never by main-lift sets', () => {
    const met = behind(stockWeek, DEFAULT_TARGETS, { extras: { triceps: 3 }, accessory: { triceps: 3, chest: 1.5 } })
    expect(met.map((g) => g.muscle)).not.toContain('triceps')
  })

  it('keeps the bigger gap when the muscle is behind anyway, and still puts it first', () => {
    const [first] = behind(stockWeek, DEFAULT_TARGETS, { extras: { calves: 3 }, accessory: {} })
    expect(first).toMatchObject({ muscle: 'calves', kind: 'target', gap: 6, focused: true })
  })

  it('takes the larger extra where focuses overlap, and drops ones that have run out', () => {
    const bench = { id: 'b', name: 'Bench', muscles: ['chest', 'triceps'] as Muscle[], extraSets: 3 }
    const arms = { id: 'a', name: 'Arms', muscles: ['biceps', 'triceps'] as Muscle[], extraSets: 6, until: 1_000 }
    expect(focusExtras([bench, arms], 500)).toEqual({ chest: 3, triceps: 6, biceps: 6 })
    expect(focusExtras([bench, arms], 1_000)).toEqual({ chest: 3, triceps: 3 })
  })

  it('steers Fill all to the focused muscles first', () => {
    const picks = fillSlots(
      {
        ...input(),
        projected: stockWeek,
        targets: DEFAULT_TARGETS,
        focus: { extras: { biceps: 3, triceps: 3 }, accessory: {} },
      },
      3,
    )
    const [first, second, third] = primaries(picks)
    expect(first).toContain('biceps')
    expect(second).toContain('triceps')
    expect(third).toContain('lats')
  })

  it('counts what Fill all adds toward the focus', () => {
    const picks = primaries(
      fillSlots(
        { ...input(), projected: stockWeek, targets: DEFAULT_TARGETS, focus: { extras: { chest: 3 }, accessory: {} } },
        3,
      ),
    )
    expect(picks[0]).toContain('chest')
    expect(picks[1]).not.toContain('chest')
    expect(picks[2]).not.toContain('chest')
  })

  it('changes nothing when there is none', () => {
    expect(behind(stockWeek, DEFAULT_TARGETS, { extras: {}, accessory: {} })).toEqual(stockGaps)
  })
})

describe("the week's projected volume", () => {
  it('counts logged sets, what is left today, and the other pending days, warm-ups aside', () => {
    const [day1, ...rest] = planWeek(NSUNS_4DAY, ctx)
    const logged = [0, 1, 2].map((index) => ({ exerciseId: 'bench-press', slotId: 'd1-t1', index, warmup: false }))
    const warmup = { exerciseId: 'bench-press', slotId: 'd1-t1', index: 0, warmup: true }
    const week = projectedWeek({
      loggedThisWeek: [...logged, warmup],
      today: day1!.mains,
      loggedToday: [...logged, warmup],
      otherPendingDays: rest,
      lookup: findExercise,
    })
    // 3 bench sets logged, 6 still to go, and 8 incline sets on Day 3.
    expect(week.chest).toBe(17)
    expect(week).toEqual(stockWeek)
  })

  it('stops counting a pending day once it is skipped', () => {
    const days = planWeek(NSUNS_4DAY, ctx)
    const withoutDay4 = projectedWeek({
      loggedThisWeek: [],
      today: [],
      loggedToday: [],
      otherPendingDays: days.slice(0, 3),
      lookup: findExercise,
    })
    expect(withoutDay4.quads).toBe(stockWeek.quads! - 8 - 4.5) // front squat, half the deadlift
  })

  it("doesn't count a planned day's pinned accessory twice once it's logged", () => {
    const day = { ...NSUNS_4DAY.days[0]!, accessories: [{ id: 'p', kind: 'pinned' as const, exerciseId: 'face-pull' }] }
    expect(plannedVolume([planDay(day, ctx)], findExercise).rearDelts).toBe(3)
  })
})
