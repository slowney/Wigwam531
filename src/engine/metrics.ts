// What the Progress screens show, worked out from logged sets and TM
// history. Nothing here is stored: it's all recalculated when read.
import { e1rm } from './records.ts'
import type { ExerciseLookup } from './types.ts'
import { loggedVolume, type MuscleCounts } from './volume.ts'

export interface MetricSet {
  id: string
  exerciseId: string
  sessionId: string
  /** The program week it was logged in. */
  weekId?: string
  weight: number
  reps: number
  warmup: boolean
  /** Epoch ms. */
  at: number
}

export interface E1rmPoint {
  at: number
  sessionId: string
  e1rm: number
  /** The set it came from. */
  weight: number
  reps: number
  setId: string
}

const working = <S extends MetricSet>(sets: ReadonlyArray<S>, exerciseId: string) =>
  sets.filter((s) => s.exerciseId === exerciseId && !s.warmup && s.reps > 0 && s.weight > 0)

/**
 * The best e1RM from each workout, oldest first, or from each program
 * week with `by: 'week'`. A main lift done heavy one day and light (as a T2)
 * another zigzags workout by workout; its weekly best is the trend. Sets past
 * 10 reps give no estimate, so a workout of only those has no point.
 */
export function e1rmSeries(
  sets: ReadonlyArray<MetricSet>,
  exerciseId: string,
  by: 'workout' | 'week' = 'workout',
): E1rmPoint[] {
  const best = new Map<string, E1rmPoint>()
  for (const s of working(sets, exerciseId)) {
    const value = e1rm(s.weight, s.reps)
    if (value === undefined) continue
    const key = by === 'week' ? (s.weekId ?? s.sessionId) : s.sessionId
    const seen = best.get(key)
    if (!seen || value > seen.e1rm) {
      best.set(key, { at: s.at, sessionId: s.sessionId, e1rm: value, weight: s.weight, reps: s.reps, setId: s.id })
    }
  }
  return [...best.values()].sort((a, b) => a.at - b.at)
}

/** The points (by set id) that beat every earlier one: the e1RM PRs along the line. */
export function e1rmPrs(series: ReadonlyArray<E1rmPoint>): Set<string> {
  const prs = new Set<string>()
  let top = -Infinity
  for (const p of series) {
    // The very first one isn't a PR; there's nothing to beat yet.
    if (top !== -Infinity && p.e1rm > top + 1e-9) prs.add(p.setId)
    top = Math.max(top, p.e1rm)
  }
  return prs
}

export interface TmStep {
  at: number
  lb: number
  reason: string
}

/** A lift's TM over time, oldest first. Same-moment duplicates keep the last. */
export function tmSteps(
  history: ReadonlyArray<{ exerciseId: string; lb: number; at: number; reason: string }>,
  exerciseId: string,
): TmStep[] {
  const steps = history
    .filter((h) => h.exerciseId === exerciseId)
    .sort((a, b) => a.at - b.at)
    .map(({ at, lb, reason }) => ({ at, lb, reason }))
  return steps.filter((s, i) => steps[i + 1]?.at !== s.at)
}

export interface RepMax {
  reps: number
  weight: number
  at: number
}

/** The heaviest weight done for at least 1, 2, … 10 reps. */
export function repMaxes(sets: ReadonlyArray<MetricSet>, exerciseId: string): (RepMax | undefined)[] {
  const out: (RepMax | undefined)[] = Array.from({ length: 10 }, () => undefined)
  for (const s of working(sets, exerciseId)) {
    for (let r = 1; r <= Math.min(10, s.reps); r++) {
      const seen = out[r - 1]
      if (!seen || s.weight > seen.weight || (s.weight === seen.weight && s.at < seen.at)) {
        out[r - 1] = { reps: r, weight: s.weight, at: s.at }
      }
    }
  }
  return out
}

export interface Bests {
  e1rm?: E1rmPoint
  heaviest?: { weight: number; reps: number; at: number }
}

/** The best e1RM and the heaviest weight ever lifted, each from its earliest set. */
export function bests(sets: ReadonlyArray<MetricSet>, exerciseId: string): Bests {
  const series = e1rmSeries(sets, exerciseId)
  const top = series.reduce<E1rmPoint | undefined>((a, b) => (!a || b.e1rm > a.e1rm + 1e-9 ? b : a), undefined)
  let heaviest: Bests['heaviest']
  for (const s of working(sets, exerciseId).sort((a, b) => a.at - b.at)) {
    if (!heaviest || s.weight > heaviest.weight) heaviest = { weight: s.weight, reps: s.reps, at: s.at }
  }
  return { e1rm: top, heaviest }
}

export interface WeekVolume {
  weekId: string
  number: number
  counts: MuscleCounts
}

/** Logged sets per muscle for each of the last `count` weeks, oldest first. */
export function weeklyVolume(
  sets: ReadonlyArray<{ weekId: string; exerciseId: string; warmup: boolean }>,
  weeks: ReadonlyArray<{ id: string; number: number }>,
  lookup: ExerciseLookup,
  count = 8,
): WeekVolume[] {
  return [...weeks]
    .sort((a, b) => a.number - b.number)
    .slice(-count)
    .map((w) => ({
      weekId: w.id,
      number: w.number,
      counts: loggedVolume(
        sets.filter((s) => s.weekId === w.id),
        lookup,
      ),
    }))
}

export type Sex = 'male' | 'female'

const LB_PER_KG = 2.20462

// DOTS coefficients (IPF, 2019), for bodyweight in kg.
const DOTS: Record<Sex, { coefficients: number[]; min: number; max: number }> = {
  male: { coefficients: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093], min: 40, max: 210 },
  female: { coefficients: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706], min: 40, max: 150 },
}

/** DOTS for a squat + bench + deadlift total, everything in pounds. */
export function dots(totalLb: number, bodyweightLb: number, sex: Sex): number {
  const { coefficients, min, max } = DOTS[sex]
  const bw = Math.min(max, Math.max(min, bodyweightLb / LB_PER_KG))
  const denominator = coefficients.reduce((sum, c, i) => sum + c * bw ** i, 0)
  return ((totalLb / LB_PER_KG) * 500) / denominator
}

export type Range = '3M' | '6M' | '1Y' | 'All'

const DAY = 24 * 60 * 60 * 1000
const RANGE_DAYS: Record<Exclude<Range, 'All'>, number> = { '3M': 91, '6M': 182, '1Y': 365 }

/** The earliest moment a range shows, counted back from `now`. */
export function rangeStart(range: Range, now: number): number {
  return range === 'All' ? -Infinity : now - RANGE_DAYS[range] * DAY
}
