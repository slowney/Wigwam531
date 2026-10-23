/** Epley breaks down past 10 reps, so higher-rep sets don't produce an estimate. */
export const E1RM_MAX_REPS = 10

export function e1rm(weight: number, reps: number): number | undefined {
  if (weight <= 0 || reps < 1 || reps > E1RM_MAX_REPS) return undefined
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

interface SetLike {
  weight: number
  reps: number
  warmup: boolean
}

export interface PrCheck {
  /** Nothing logged for this exercise before; not worth a badge. */
  firstTime: boolean
  /** Heavier than anything logged before. */
  heaviest: boolean
  /** More reps than ever at this weight or heavier. */
  repPr: boolean
  e1rmPr: boolean
  previousBestReps?: number
  previousBestE1rm?: number
}

export function checkPr(set: { weight: number; reps: number }, history: ReadonlyArray<SetLike>): PrCheck {
  const working = history.filter((h) => !h.warmup)
  if (working.length === 0) {
    return { firstTime: true, heaviest: false, repPr: false, e1rmPr: false }
  }

  const heaviest = set.weight > Math.max(...working.map((h) => h.weight))

  // "At this weight or heavier": 215 x 6 isn't a PR if 225 x 6 is on record.
  const atOrAbove = working.filter((h) => h.weight >= set.weight)
  const previousBestReps = atOrAbove.length ? Math.max(...atOrAbove.map((h) => h.reps)) : undefined
  const repPr = previousBestReps !== undefined && set.reps > previousBestReps

  const estimates = working.map((h) => e1rm(h.weight, h.reps)).filter((e) => e !== undefined)
  const previousBestE1rm = estimates.length ? Math.max(...estimates) : undefined
  const current = e1rm(set.weight, set.reps)
  const e1rmPr =
    current !== undefined && previousBestE1rm !== undefined && current > previousBestE1rm + 1e-9

  return { firstTime: false, heaviest, repPr, e1rmPr, previousBestReps, previousBestE1rm }
}
