import { parseRangeSchemeId, type PercentSet, type Scheme, type SchemeLookup } from '../engine/schemes.ts'

// nSuns 5/3/1 LP, 4-day. Percentages are of the slot's TM; the 95% 1+ set
// is the one that decides next week's TM.

const set = (pct: number, reps: number): PercentSet => ({ pct, reps })
const amrap = (pct: number, reps: number): PercentSet => ({ pct, reps, amrap: true })
const star = (pct: number, reps: number): PercentSet => ({ pct, reps, amrap: true, progression: true })

const T1_BENCH = [
  set(75, 5), set(85, 3), star(95, 1), set(90, 3), set(85, 5),
  set(80, 3), set(75, 5), set(70, 3), amrap(65, 5),
]

const T1_SQUAT_OHP = [
  set(75, 5), set(85, 3), star(95, 1), set(90, 3), set(85, 3),
  set(80, 3), set(75, 5), set(70, 5), amrap(65, 5),
]

const T1_DEADLIFT = [
  set(75, 5), set(85, 3), star(95, 1), set(90, 3), set(85, 3),
  set(80, 3), set(75, 3), set(70, 3), amrap(65, 3),
]

/** Every nSuns T2 has the same shape: two ramp sets, then six at one weight. */
function t2(start: number, firstReps: number): PercentSet[] {
  return [
    set(start, firstReps),
    set(start + 10, 5),
    ...[3, 5, 7, 4, 6, 8].map((reps) => set(start + 20, reps)),
  ]
}

// 5/3/1 (Wendler): a three-week wave of 5s, 3s and 5/3/1, each week ending
// on a 1+ set. Deloads and TM tests come every six weeks, as a "7th week".
const WAVE_531 = [
  [set(65, 5), set(75, 5), amrap(85, 5)],
  [set(70, 3), set(80, 3), amrap(90, 3)],
  [set(75, 5), set(85, 3), amrap(95, 1)],
]

/** Boring But Strong: 10 × 5 at the main work's first set ("first set last"). */
const WAVE_BBS = [65, 70, 75].map((pct) => Array.from({ length: 10 }, () => set(pct, 5)))

const WAVE_NAMES = ['5s', '3s', '5/3/1']

export const SCHEMES: Scheme[] = [
  { kind: 'percent', id: 'nsuns-t1-bench', name: 'nSuns T1 bench', sets: T1_BENCH },
  { kind: 'percent', id: 'nsuns-t1-squat', name: 'nSuns T1 squat', sets: T1_SQUAT_OHP },
  { kind: 'percent', id: 'nsuns-t1-ohp', name: 'nSuns T1 OHP', sets: T1_SQUAT_OHP },
  { kind: 'percent', id: 'nsuns-t1-deadlift', name: 'nSuns T1 deadlift', sets: T1_DEADLIFT },
  { kind: 'percent', id: 'nsuns-t2-ohp', name: 'nSuns T2 OHP', sets: t2(50, 6) },
  { kind: 'percent', id: 'nsuns-t2-sumo', name: 'nSuns T2 sumo', sets: t2(50, 5) },
  { kind: 'percent', id: 'nsuns-t2-incline', name: 'nSuns T2 incline', sets: t2(40, 6) },
  { kind: 'percent', id: 'nsuns-t2-front-squat', name: 'nSuns T2 front squat', sets: t2(35, 5) },
  { kind: 'range', id: 'range-4x6-8', name: '4 x 6-8', sets: 4, reps: [6, 8] },
  {
    kind: 'percent',
    id: '531-main',
    name: '5/3/1',
    sets: WAVE_531[0]!,
    waves: WAVE_531,
    waveNames: WAVE_NAMES,
    cycle: true,
  },
  { kind: 'percent', id: '531-bbs', name: '5/3/1 BBS (10 × 5)', sets: WAVE_BBS[0]!, waves: WAVE_BBS, waveNames: WAVE_NAMES },
  // Boring But Big: 5 × 10 at 50% of the same lift's TM, every week.
  { kind: 'percent', id: '531-bbb', name: '5/3/1 BBB (5 × 10)', sets: Array.from({ length: 5 }, () => set(50, 10)) },
]

const byId = new Map(SCHEMES.map((s) => [s.id, s]))

// Schemes built in the app live in IndexedDB; the app keeps this copy in
// step, the same way it does for custom exercises.
let custom = new Map<string, Scheme>()

export function setCustomSchemes(list: ReadonlyArray<Scheme>): void {
  custom = new Map(list.map((s) => [s.id, s]))
}

export const findScheme: SchemeLookup = (id) => byId.get(id) ?? custom.get(id) ?? parseRangeSchemeId(id)

/** Built-ins first, then the ones made in the app. */
export function allSchemes(): Scheme[] {
  return [...SCHEMES, ...custom.values()]
}
