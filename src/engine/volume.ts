import type { PlannedDay } from './plan.ts'
import type { ExerciseLookup, Muscle } from './types.ts'

/** Weighted hard sets per muscle: a primary mover counts 1, a secondary 0.5. */
export type MuscleCounts = Partial<Record<Muscle, number>>

function add(into: MuscleCounts, exerciseId: string, sets: number, lookup: ExerciseLookup): void {
  const exercise = lookup(exerciseId)
  if (!exercise) return
  for (const [muscle, weight] of Object.entries(exercise.muscles) as [Muscle, number][]) {
    into[muscle] = (into[muscle] ?? 0) + weight * sets
  }
}

/** Warm-ups don't count. */
export function loggedVolume(
  sets: ReadonlyArray<{ exerciseId: string; warmup: boolean }>,
  lookup: ExerciseLookup,
): MuscleCounts {
  const counts: MuscleCounts = {}
  for (const s of sets) if (!s.warmup) add(counts, s.exerciseId, 1, lookup)
  return counts
}

/**
 * Volume still to come on the given days: every main-lift working set, plus
 * pinned accessories at their default set count. Flex slots are unknown
 * until they're filled, so they add nothing.
 */
export function plannedVolume(days: ReadonlyArray<PlannedDay>, lookup: ExerciseLookup): MuscleCounts {
  const counts: MuscleCounts = {}
  for (const day of days) {
    for (const slot of day.mains) add(counts, slot.exerciseId, slot.sets.length, lookup)
    for (const acc of day.accessories) {
      if (acc.kind === 'pinned') add(counts, acc.exerciseId, lookup(acc.exerciseId)?.sets ?? 0, lookup)
    }
  }
  return counts
}

export function combine(...parts: MuscleCounts[]): MuscleCounts {
  const out: MuscleCounts = {}
  for (const part of parts) {
    for (const [muscle, n] of Object.entries(part) as [Muscle, number][]) {
      out[muscle] = (out[muscle] ?? 0) + n
    }
  }
  return out
}
