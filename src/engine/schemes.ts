export interface PercentSet {
  /** Whole-number percent of the slot's TM. */
  pct: number
  reps: number
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
  sets: PercentSet[]
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
