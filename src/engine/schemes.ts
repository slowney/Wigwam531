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
}

/** The sets for one week of a scheme: its wave week, for a wave. */
export function waveSets(scheme: PercentScheme, waveIndex: number): PercentSet[] {
  if (!scheme.waves?.length) return scheme.sets
  return scheme.waves[waveIndex % scheme.waves.length]!
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
