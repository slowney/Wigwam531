// Goals: a target e1RM per big lift, and when it might come, two ways. "On
// plan" assumes the program's own progression from here, deloads and all;
// "at your pace" carries on the way the TM has actually moved lately,
// stalls and resets included. Both are straight lines, and strength gains
// slow down, so later dates are more likely to be optimistic.
import type { E1rmPoint, TmStep } from './metrics.ts'
import { slotTmId, type Program } from './program.ts'
import { WEEKS_BETWEEN_RESETS, cycleStep, increaseFor, type ProgressionTable } from './progression.ts'
import type { SchemeLookup } from './schemes.ts'
import type { Exercise } from './types.ts'

const DAY = 86_400_000
/** A TM is 90% of a max, so a max moves 1/0.9 as fast as the TM under it. */
const TM_SHARE = 0.9
/** The e1RM a goal starts from: the best in this many recent days. */
const CURRENT_DAYS = 42
/** "Your pace" reads this far back... */
const PACE_DAYS = 84
/** ...and needs at least this much TM history to say anything. */
const MIN_PACE_DAYS = 28

export interface Eta {
  days: number
  /** Epoch ms. */
  at: number
}

export interface GoalForecast {
  exerciseId: string
  target: number
  /** Where it stands now: the best recent e1RM, or the TM's implied max when there's nothing logged lately. */
  current?: number
  currentFrom?: 'e1rm' | 'tm'
  reached: boolean
  /** Undefined when the program doesn't move this lift's TM. */
  plan?: Eta
  /** `stalled` when the TM hasn't gone up lately; undefined with too little history. */
  pace?: Eta | 'stalled'
}

/**
 * The TM gain a normal program week is planned to bring. A 5/3/1 cycle
 * steps once every three weeks. An nSuns ★ set adds what the progression
 * table gives for the 1+ reps this person has been getting lately (2 when
 * there's nothing yet, the usual pass).
 */
export function planTmPerWeek(args: {
  program: Program
  schemes: SchemeLookup
  exerciseId: string
  region: Exercise['region']
  table: ProgressionTable
  /** Reps on this lift's recent 1+ (★) sets, newest last. */
  recentStarReps: ReadonlyArray<number>
}): number | undefined {
  const slots = args.program.days.flatMap((d) => d.mains).filter((s) => slotTmId(s) === args.exerciseId)
  const schemes = slots.map((s) => args.schemes(s.schemeId)).filter((s) => s?.kind === 'percent')
  if (schemes.some((s) => s.cycle)) return cycleStep(args.region) / 3
  if (!schemes.some((s) => s.sets.some((x) => x.progression))) return undefined
  const recent = args.recentStarReps.slice(-4)
  const sorted = [...recent].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : 2
  return increaseFor(median, args.table)
}

/**
 * How many days a program week usually takes this person, from when their
 * recent weeks started. Weeks aren't tied to the calendar, so a group that
 * takes nine days a week gets there later than one that takes seven.
 */
export function daysPerWeek(weeks: ReadonlyArray<{ startedAt: number }>): number {
  const starts = weeks.map((w) => w.startedAt).sort((a, b) => a - b).slice(-7)
  const gaps = starts.slice(1).map((t, i) => (t - starts[i]!) / DAY)
  if (gaps.length < 2) return 7
  const sorted = [...gaps].sort((a, b) => a - b)
  return Math.min(14, Math.max(4, sorted[Math.floor(sorted.length / 2)]!))
}

export function forecastGoal(args: {
  exerciseId: string
  target: number
  /** Weekly-best e1RMs, oldest first. */
  e1rms: ReadonlyArray<E1rmPoint>
  tm: ReadonlyArray<TmStep>
  /** See `planTmPerWeek`. */
  planTmPerWeek?: number
  daysPerWeek: number
  now: number
}): GoalForecast {
  const base = { exerciseId: args.exerciseId, target: args.target }
  const recent = args.e1rms.filter((p) => p.at >= args.now - CURRENT_DAYS * DAY && p.at <= args.now)
  const latestTm = args.tm.at(-1)?.lb
  const current = recent.length
    ? Math.max(...recent.map((p) => p.e1rm))
    : latestTm !== undefined
      ? latestTm / TM_SHARE
      : undefined
  if (current === undefined) return { ...base, reached: false }
  const from = { current, currentFrom: recent.length ? ('e1rm' as const) : ('tm' as const) }
  const gap = args.target - current
  if (gap <= 0) return { ...base, ...from, reached: true }

  const eta = (perDay: number): Eta => {
    const days = Math.ceil(gap / perDay)
    return { days, at: args.now + days * DAY }
  }

  // Every WEEKS_BETWEEN_RESETS normal weeks, a deload or TM test week moves nothing.
  const planPerDay =
    args.planTmPerWeek && args.planTmPerWeek > 0
      ? ((args.planTmPerWeek / TM_SHARE) * (WEEKS_BETWEEN_RESETS / (WEEKS_BETWEEN_RESETS + 1))) / args.daysPerWeek
      : undefined

  let pace: GoalForecast['pace']
  const first = args.tm[0]
  if (first && args.now - first.at >= MIN_PACE_DAYS * DAY && latestTm !== undefined) {
    const since = Math.max(first.at, args.now - PACE_DAYS * DAY)
    const then = [...args.tm].reverse().find((s) => s.at <= since) ?? first
    const perDay = (latestTm - then.lb) / TM_SHARE / ((args.now - since) / DAY)
    pace = perDay > 0 ? eta(perDay) : 'stalled'
  }

  return { ...base, ...from, reached: false, ...(planPerDay ? { plan: eta(planPerDay) } : {}), ...(pace ? { pace } : {}) }
}
