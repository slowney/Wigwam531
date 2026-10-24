import type { ExerciseLookup, Gym, LoadType, PlatePair } from './types.ts'

export type RoundingMode = 'nearest' | 'down'

export interface Rounding {
  step: number
  mode: RoundingMode
}

export const DEFAULT_ROUNDING: Rounding = { step: 5, mode: 'nearest' }

export function roundWeight(lb: number, rounding: Rounding = DEFAULT_ROUNDING): number {
  const units = lb / rounding.step
  // Halves round up, matching MROUND in the nSuns spreadsheet. The epsilon
  // keeps 'down' from flooring 204.99999 to 200 after float multiplication.
  const n = rounding.mode === 'down' ? Math.floor(units + 1e-9) : Math.round(units)
  return n * rounding.step
}

/**
 * `pct` is a whole-number percent. Multiplying before dividing keeps
 * TM x pct an exact integer, so exact halves (90% of 225 = 202.5) stay
 * exact instead of landing a hair under and rounding the wrong way.
 */
export function percentOf(tm: number, pct: number, rounding: Rounding = DEFAULT_ROUNDING): number {
  return roundWeight((tm * pct) / 100, rounding)
}

export function tmFromOneRepMax(oneRepMax: number, rounding: Rounding = DEFAULT_ROUNDING): number {
  return percentOf(oneRepMax, 90, rounding)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Every per-side load the plates can make, ascending. */
export function perSideLoads(plates: PlatePair[]): number[] {
  let sums = new Set<number>([0])
  for (const p of plates) {
    const next = new Set<number>()
    for (const s of sums) {
      for (let k = 0; k <= p.pairs; k++) next.add(round2(s + k * p.weight))
    }
    sums = next
  }
  return [...sums].sort((a, b) => a - b)
}

export function canLoad(total: number, bar: number, plates: PlatePair[]): boolean {
  if (total < bar) return false
  return perSideLoads(plates).includes(round2((total - bar) / 2))
}

export function maxLoad(bar: number, plates: PlatePair[]): number {
  return bar + 2 * plates.reduce((sum, p) => sum + p.weight * p.pairs, 0)
}

/**
 * The next weight up for double progression, or undefined when there is
 * nothing heavier to grab (the 55s are the heaviest dumbbells) or weight
 * isn't how the exercise progresses (bodyweight and bands add reps).
 */
export function nextLoad(current: number, load: LoadType, gym: Gym): number | undefined {
  switch (load) {
    case 'dumbbell':
      return gym.dumbbells.find((w) => w > current)
    case 'kettlebell':
      return gym.kettlebells.find((w) => w > current)
    case 'cable':
      return current + gym.cableStep
    case 'bodyweight':
    case 'band':
      return undefined
    case 'barbell':
    case 'trapBar':
    case 'ezBar':
    case 'landmine':
      return current + 5
  }
}

/** The next weight down, the mirror of `nextLoad`. Undefined at the lightest there is. */
export function previousLoad(current: number, load: LoadType, gym: Gym): number | undefined {
  const below = (list: number[]) => [...list].reverse().find((w) => w < current)
  switch (load) {
    case 'dumbbell':
      return below(gym.dumbbells)
    case 'kettlebell':
      return below(gym.kettlebells)
    case 'cable':
      return current - gym.cableStep > 0 ? current - gym.cableStep : undefined
    case 'bodyweight':
    case 'band':
      return undefined
    case 'barbell':
    case 'trapBar':
    case 'ezBar':
    case 'landmine':
      return current - 5 > 0 ? current - 5 : undefined
  }
}

/** Bar weight for warm-ups and plate checks; undefined for non-bar lifts. */
export function barWeight(load: LoadType, gym: Gym): number | undefined {
  switch (load) {
    case 'barbell':
      return gym.bars.barbell
    case 'trapBar':
      return gym.bars.trapBar
    case 'ezBar':
      return gym.bars.ezBar
    default:
      return undefined
  }
}

/** The gym-specific parts of a plan context: bar weights and plate limits. */
export function gymChecks(gym: Gym, lookup: ExerciseLookup) {
  const barFor = (exerciseId: string) => {
    const exercise = lookup(exerciseId)
    return exercise ? barWeight(exercise.load, gym) : undefined
  }
  return {
    barFor,
    canLoad: (exerciseId: string, weight: number) => {
      const bar = barFor(exerciseId)
      return bar === undefined || canLoad(weight, bar, gym.plates)
    },
  }
}
