import type { WeekType } from './plan.ts'
import { TM_TEST_PASS_REPS } from './schemes.ts'
import type { Exercise } from './types.ts'
import { DEFAULT_ROUNDING, percentOf, type Rounding } from './weights.ts'

export interface Bracket {
  minReps: number
  increase: number
}

/** Ascending by minReps. The highest bracket the reps reach wins. */
export type ProgressionTable = Bracket[]

// From the nSuns guidance (0-1 / 2-3 / 4-5 / 5+ reps), with presses at the
// low end of each range since they stall sooner.
export const UPPER_TABLE: ProgressionTable = [
  { minReps: 0, increase: 0 },
  { minReps: 2, increase: 5 },
  { minReps: 4, increase: 5 },
  { minReps: 6, increase: 10 },
]

export const LOWER_TABLE: ProgressionTable = [
  { minReps: 0, increase: 0 },
  { minReps: 2, increase: 5 },
  { minReps: 4, increase: 10 },
  { minReps: 6, increase: 15 },
]

export function defaultTable(region: Exercise['region']): ProgressionTable {
  return region === 'lower' ? LOWER_TABLE : UPPER_TABLE
}

export function increaseFor(reps: number, table: ProgressionTable): number {
  let increase = 0
  for (const b of table) if (reps >= b.minReps) increase = b.increase
  return increase
}

export type TmReason =
  | 'progression'
  | 'stall'
  | 'skipped'
  | 'deload'
  | 'tmTestPassed'
  | 'tmTestFailed'

export interface TmProposal {
  exerciseId: string
  current: number
  /** What Start Week pre-fills. Always editable before it's applied. */
  proposed: number
  reason: TmReason
  reps?: number
  /** A reset offered alongside the proposal, never pre-applied. */
  resetTo?: number
}

export interface ProposalInput {
  /** The week that just ended. */
  weekType: WeekType
  /** Current TM for every TM-driven lift, by exercise id. */
  tms: Readonly<Record<string, number>>
  /** Reps on each TM's 1+ set (or 100% set in a TM-test week) this week. */
  results: Readonly<Record<string, number>>
  /** The most recent 1+ result before this week, skips excluded. */
  previous: Readonly<Record<string, number | undefined>>
  tables: (exerciseId: string) => ProgressionTable
  rounding?: Rounding
}

/** 0-1 reps on the 1+ set, two times running, is a stall. */
const STALL_REPS = 1

export function proposeTmChanges(input: ProposalInput): TmProposal[] {
  const rounding = input.rounding ?? DEFAULT_ROUNDING
  return Object.entries(input.tms).map(([exerciseId, current]): TmProposal => {
    const reps = input.results[exerciseId]
    const lowered = percentOf(current, 90, rounding)

    if (input.weekType === 'deload') return { exerciseId, current, proposed: current, reason: 'deload' }
    if (reps === undefined) return { exerciseId, current, proposed: current, reason: 'skipped' }

    if (input.weekType === 'tmTest') {
      // Failing the test is a direct measurement, so the lower TM is
      // pre-filled. Passing it means the TM is right where it is.
      return reps >= TM_TEST_PASS_REPS
        ? { exerciseId, current, proposed: current, reason: 'tmTestPassed', reps }
        : { exerciseId, current, proposed: lowered, reason: 'tmTestFailed', reps }
    }

    const proposed = current + increaseFor(reps, input.tables(exerciseId))
    const last = input.previous[exerciseId]
    if (reps <= STALL_REPS && last !== undefined && last <= STALL_REPS) {
      return { exerciseId, current, proposed, reason: 'stall', reps, resetTo: lowered }
    }
    return { exerciseId, current, proposed, reason: 'progression', reps }
  })
}

export interface DoubleProgression {
  /** Undefined when there's no history: the lifter picks a starting weight. */
  weight?: number
  reason: 'start' | 'hold' | 'increase' | 'maxed'
}

/**
 * Holds the working weight until every set reaches the top of the range,
 * then steps up. `next` is the gym-aware step (next dumbbell, next pin);
 * when there's nothing heavier, the weight holds and the reps keep climbing.
 */
export function nextWorkingWeight(
  lastSession: ReadonlyArray<{ weight: number; reps: number }>,
  reps: [number, number],
  sets: number,
  next: (weight: number) => number | undefined,
): DoubleProgression {
  if (lastSession.length === 0) return { reason: 'start' }
  const top = Math.max(...lastSession.map((s) => s.weight))
  const atTop = lastSession.filter((s) => s.weight >= top).slice(0, sets)
  const earned = atTop.length >= sets && atTop.every((s) => s.reps >= reps[1])
  if (!earned) return { weight: top, reason: 'hold' }
  const up = next(top)
  return up === undefined ? { weight: top, reason: 'maxed' } : { weight: up, reason: 'increase' }
}
