import type { WeekType } from './plan.ts'
import { slotTmId, type Program } from './program.ts'
import type { SchemeLookup } from './schemes.ts'
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
  /** A 5/3/1 cycle finished with every 1+ set made: the fixed step. */
  | 'cycle'
  /** Partway through a 5/3/1 cycle: TMs move at its end. */
  | 'midCycle'
  /** A 5/3/1 cycle finished, but a 1+ set fell short: the TM holds. */
  | 'cycleMissed'
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
  /**
   * TMs run by a 5/3/1 cycle instead of a weekly ★ set: whether the ending
   * week was the cycle's last, and whether every 1+ set that week made its
   * reps (undefined when none were done).
   */
  cycles?: Readonly<Record<string, { last: boolean; made?: boolean }>>
  /** The step a cycle-run TM takes (see `cycleStep`). */
  cycleStep?: (exerciseId: string) => number
}

/** Classic 5/3/1: +5 lb a cycle on upper-body lifts, +10 on lower. */
export function cycleStep(region: Exercise['region']): number {
  return region === 'lower' ? 10 : 5
}

/** 0-1 reps on the 1+ set, two times running, is a stall. */
const STALL_REPS = 1

export function proposeTmChanges(input: ProposalInput): TmProposal[] {
  const rounding = input.rounding ?? DEFAULT_ROUNDING
  return Object.entries(input.tms).map(([exerciseId, current]): TmProposal => {
    const reps = input.results[exerciseId]
    const lowered = percentOf(current, 90, rounding)

    if (input.weekType === 'deload') return { exerciseId, current, proposed: current, reason: 'deload' }
    const cycle = input.cycles?.[exerciseId]
    if (cycle && input.weekType === 'normal') {
      if (!cycle.last) return { exerciseId, current, proposed: current, reason: 'midCycle' }
      if (cycle.made === undefined) return { exerciseId, current, proposed: current, reason: 'skipped' }
      if (!cycle.made) return { exerciseId, current, proposed: current, reason: 'cycleMissed' }
      return { exerciseId, current, proposed: current + input.cycleStep!(exerciseId), reason: 'cycle' }
    }
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
  /** The heaviest weight lifted last time, when there was a last time. */
  last?: number
}

/**
 * What beats a rep range. `every` set at the working weight reaching the
 * top suits the heavy row, where the range keeps a heavy barbell lift
 * honest. `any` set suits accessories, which rarely get every set to the
 * top before fatigue sets in.
 */
export type RangeRule = 'every' | 'any'

/**
 * Holds the working weight until the range is beaten, then steps up.
 * `next` is the gym-aware step (next dumbbell, next pin); when there's
 * nothing heavier, the weight holds and the reps keep climbing. A failed
 * set (no reps) says nothing about the weight, so it's left out.
 */
export function nextWorkingWeight(
  lastSession: ReadonlyArray<{ weight: number; reps: number }>,
  reps: [number, number],
  sets: number,
  next: (weight: number) => number | undefined,
  rule: RangeRule = 'every',
): DoubleProgression {
  const lifted = lastSession.filter((s) => s.reps > 0)
  const counted = lifted.length ? lifted : lastSession
  if (counted.length === 0) return { reason: 'start' }
  const top = Math.max(...counted.map((s) => s.weight))
  const atTop = counted.filter((s) => s.weight >= top)
  const earned =
    rule === 'any'
      ? atTop.some((s) => s.reps >= reps[1])
      : atTop.length >= sets && atTop.slice(0, sets).every((s) => s.reps >= reps[1])
  if (!earned) return { weight: top, reason: 'hold', last: top }
  const up = next(top)
  return up === undefined ? { weight: top, reason: 'maxed', last: top } : { weight: up, reason: 'increase', last: top }
}

export interface WeekTypeSuggestion {
  type: Exclude<WeekType, 'normal'>
  /** Shown at Start Week, so the suggestion explains itself. */
  reason: string
}

/** Normal weeks in a row before a deload or a TM test comes up. */
export const WEEKS_BETWEEN_RESETS = 6

/**
 * What the next week should be, if not a normal one. Two or more lifts
 * stalling (two weeks running at 0-1 reps on their 1+ set) calls for a
 * deload. Otherwise, after six normal weeks, a deload or a TM test comes
 * up, taking turns: a TM test if the last one was a deload, a deload if it
 * was a TM test. `weeks` is every week so far, the ending one included.
 */
export function suggestWeekType(
  weeks: ReadonlyArray<{ number: number; type: WeekType }>,
  stalledLifts: number,
): WeekTypeSuggestion | undefined {
  if (stalledLifts >= 2) {
    return { type: 'deload', reason: `${stalledLifts} lifts have stalled two weeks running.` }
  }
  let normal = 0
  let last: WeekType | undefined
  for (const w of [...weeks].sort((a, b) => b.number - a.number)) {
    if (w.type !== 'normal') {
      last = w.type
      break
    }
    normal++
  }
  if (normal < WEEKS_BETWEEN_RESETS) return undefined
  const since = last === 'deload' ? 'deload' : last === 'tmTest' ? 'TM test' : undefined
  return {
    type: last === 'deload' ? 'tmTest' : 'deload',
    reason: since ? `${normal} normal weeks since the last ${since}.` : `${normal} normal weeks so far, with no deload yet.`,
  }
}

/**
 * For each TM a 5/3/1 cycle runs: whether this week was its cycle's last
 * wave week, and whether every 1+ set on it this week made its reps. A TM
 * that a weekly ★ set also drives stays on the weekly rule.
 */
export function cycleResults(
  program: Program,
  schemes: SchemeLookup,
  waveIndex: number,
  weekSets: ReadonlyArray<{
    exerciseId: string
    tmExerciseId?: string
    amrap: boolean
    warmup: boolean
    reps: number
    prescribedReps: number
  }>,
): Record<string, { last: boolean; made?: boolean }> {
  const weekly = new Set<string>()
  const cycles = new Map<string, number>()
  for (const slot of program.days.flatMap((d) => d.mains)) {
    const scheme = schemes(slot.schemeId)
    if (scheme?.kind !== 'percent') continue
    if (scheme.sets.some((s) => s.progression)) weekly.add(slotTmId(slot))
    if (scheme.cycle) cycles.set(slotTmId(slot), scheme.waves?.length ?? 1)
  }
  const out: Record<string, { last: boolean; made?: boolean }> = {}
  for (const [id, length] of cycles) {
    if (weekly.has(id)) continue
    const tops = weekSets.filter((s) => !s.warmup && s.amrap && (s.tmExerciseId ?? s.exerciseId) === id)
    out[id] = {
      last: waveIndex % length === length - 1,
      made: tops.length ? tops.every((s) => s.reps >= s.prescribedReps) : undefined,
    }
  }
  return out
}
