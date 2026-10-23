import type { WeekType } from './plan.ts'
import type { Program, ProgramDay } from './program.ts'
import type { LoggedSet } from './types.ts'

export type DayStatus = 'pending' | 'done' | 'skipped'

/** One pass through a profile's program. Weeks are per person, not calendar weeks. */
export interface WeekState {
  number: number
  type: WeekType
  /** Days missing from the map are pending, so a day added mid-week just appears. */
  days: Readonly<Record<string, DayStatus>>
}

export function statusOf(week: WeekState, dayId: string): DayStatus {
  return week.days[dayId] ?? 'pending'
}

export function pendingDays(program: Program, week: WeekState): ProgramDay[] {
  return program.days.filter((d) => statusOf(week, d.id) === 'pending')
}

/** First pending day in program order. Any pending day can still be picked instead. */
export function nextDay(program: Program, week: WeekState): ProgramDay | undefined {
  return pendingDays(program, week)[0]
}

export function isWeekComplete(program: Program, week: WeekState): boolean {
  return pendingDays(program, week).length === 0
}

function latestRepsByTm(sets: LoggedSet[], keep: (s: LoggedSet) => boolean): Record<string, number> {
  const latest: Record<string, LoggedSet> = {}
  for (const s of sets) {
    if (s.warmup || !s.tmExerciseId || !keep(s)) continue
    const seen = latest[s.tmExerciseId]
    if (!seen || s.at >= seen.at) latest[s.tmExerciseId] = s
  }
  return Object.fromEntries(Object.entries(latest).map(([tm, s]) => [tm, s.reps]))
}

/**
 * Reps on each TM's 1+ set, from a week's logged sets. A lift that was
 * skipped or swapped out has no entry, and so its TM holds.
 */
export function progressionReps(sets: LoggedSet[]): Record<string, number> {
  return latestRepsByTm(sets, (s) => s.progression === true)
}

export function tmTestReps(sets: LoggedSet[]): Record<string, number> {
  return latestRepsByTm(sets, (s) => s.tmTest === true)
}
