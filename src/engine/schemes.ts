export interface PercentSet {
  /** Whole-number percent of the slot's TM. */
  pct: number
  reps: number
  /** Top of a rep range ("6–8"): the weight still comes from the TM, the reps are the lifter's call within it. */
  repsMax?: number
  amrap?: boolean
  /** The 1+ set whose reps decide next week's TM. */
  progression?: boolean
  /** The 100% set of a TM-test week: 3-5 clean reps means the TM is right. */
  tmTest?: boolean
}

/** nSuns-style work: fixed percentages of a training max. */
export interface PercentScheme {
  kind: 'percent'
  id: string
  name: string
  /** The sets, or the first week's for a wave. */
  sets: PercentSet[]
  /**
   * Lighter sets to climb to the first working set, logged as warm-ups.
   * Each is dropped if it lands at the bar or within 10 lb of the working
   * weight, so a light lift gets one and a heavy lift two. Normal weeks
   * only, and a slot's own full warm-up replaces it.
   */
  ramp?: PercentSet[]
  /**
   * 5/3/1-style: different sets each week of a cycle (5s, 3s, 5/3/1),
   * picked by where the week falls in the wave. `sets` is the first week.
   */
  waves?: PercentSet[][]
  /** "5s", "3s", "5/3/1": one per wave week. */
  waveNames?: string[]
  /**
   * Classic 5/3/1 progression: the TM moves once a cycle, after the last
   * wave week, by a fixed step, and only if every 1+ set made its reps.
   * No ★ set drives it week to week.
   */
  cycle?: boolean
  /**
   * Wendler's BBB build-up: lighter sets the first cycles, stepping up a
   * cycle (BUILD_WEEKS normal weeks of it) at a time and staying on the
   * last. `sets` is the first step.
   */
  build?: PercentSet[][]
}

/** Normal weeks on each build-up step: one 5/3/1 cycle. */
export const BUILD_WEEKS = 3

/** Which build-up step a lift is on, from the normal weeks it has run the scheme. */
export function buildStep(scheme: PercentScheme, weeksRun: number): number {
  if (!scheme.build?.length) return 0
  return Math.min(Math.floor(weeksRun / BUILD_WEEKS), scheme.build.length - 1)
}

/** The sets for one week of a scheme: its wave week for a wave, its step for a build-up. */
export function waveSets(scheme: PercentScheme, waveIndex: number, weeksRun = 0): PercentSet[] {
  if (scheme.build?.length) return scheme.build[buildStep(scheme, weeksRun)]!
  if (!scheme.waves?.length) return scheme.sets
  return scheme.waves[waveIndex % scheme.waves.length]!
}

/** "Build-up 1 of 3" until the last step, which is where the scheme then stays. */
export function buildName(scheme: PercentScheme, weeksRun: number): string | undefined {
  if (!scheme.build?.length) return undefined
  const step = buildStep(scheme, weeksRun)
  return step < scheme.build.length - 1 ? `Build-up ${step + 1} of ${scheme.build.length}` : undefined
}

/** "3s week", for the wave week a week falls on. Undefined for a scheme without waves. */
export function waveName(scheme: PercentScheme, waveIndex: number): string | undefined {
  if (!scheme.waves?.length) return undefined
  const i = waveIndex % scheme.waves.length
  return `${scheme.waveNames?.[i] ?? `Week ${i + 1}`} week`
}

/** Double progression: a working weight held until every set hits the top of the range. */
export interface RangeScheme {
  kind: 'range'
  id: string
  name: string
  sets: number
  reps: [number, number]
}

export type Scheme = PercentScheme | RangeScheme

/**
 * A scheme's sets x reps as a rep range, when every set asks the same reps
 * ("5 x 10", "3 x 6-8"). A swapped-in lift without a TM keeps that shape
 * at a weight the lifter picks: Wendler's dumbbell BBB is still 5 x 10, just
 * not programmed by percentage. A pyramid has no one shape.
 */
export function schemeShape(scheme: Scheme): { sets: number; reps: [number, number] } | undefined {
  if (scheme.kind === 'range') return { sets: scheme.sets, reps: scheme.reps }
  const [first, ...rest] = scheme.sets
  if (!first || first.amrap) return undefined
  const same = rest.every((s) => s.reps === first.reps && s.repsMax === first.repsMax && !s.amrap)
  return same ? { sets: scheme.sets.length, reps: [first.reps, first.repsMax ?? first.reps] } : undefined
}

export type SchemeLookup = (id: string) => Scheme | undefined

/**
 * Rep-range schemes are named by their shape ("range-3x8-12"), so any
 * shape can be referenced without being registered first: accessories and
 * today-only swaps each bring their own.
 */
export function rangeSchemeId(sets: number, reps: readonly [number, number]): string {
  return `range-${sets}x${reps[0]}-${reps[1]}`
}

export function parseRangeSchemeId(id: string): RangeScheme | undefined {
  const m = /^range-(\d+)x(\d+)-(\d+)$/.exec(id)
  if (!m) return undefined
  const [sets, low, high] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return { kind: 'range', id, name: `${sets} x ${low}-${high}`, sets, reps: [low, high] }
}

export const DELOAD_SETS: PercentSet[] = [
  { pct: 40, reps: 5 },
  { pct: 50, reps: 5 },
  { pct: 60, reps: 5 },
]

// Wendler's TM test from 5/3/1 Forever.
export const TM_TEST_SETS: PercentSet[] = [
  { pct: 70, reps: 5 },
  { pct: 80, reps: 5 },
  { pct: 90, reps: 5 },
  { pct: 100, reps: 5, tmTest: true },
]

export const TM_TEST_PASS_REPS = 3
