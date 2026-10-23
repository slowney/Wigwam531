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
]

const byId = new Map(SCHEMES.map((s) => [s.id, s]))

export const findScheme: SchemeLookup = (id) => byId.get(id) ?? parseRangeSchemeId(id)
