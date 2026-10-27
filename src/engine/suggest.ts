// Accessory suggestions: which muscles are behind for the week, which
// exercises would help, in what order, and how "Fill all" spends the slots.
import { focusMuscles, type DayFocus } from './program.ts'
import { withExercise, type MuscleCounts } from './volume.ts'
import {
  MUSCLES,
  type Equipment,
  type Exercise,
  type Focus,
  type Muscle,
  type MuscleTargets,
  type Rating,
  type Restriction,
} from './types.ts'

export interface Gap {
  muscle: Muscle
  /**
   * Projected weighted sets for the week against the target. For a focus
   * gap (`kind: 'focus'`), accessory sets against the focus's extra sets.
   */
  have: number
  target: number
  gap: number
  kind: 'target' | 'focus'
  /** Part of an active focus, so it sorts ahead of everything else the day's lean allows. */
  focused: boolean
  /** One of the muscles today's accessory focus leans toward (always, on a Full day). */
  fitsDay: boolean
}

export interface FocusState {
  /** Extra accessory sets a week wanted, by muscle. */
  extras: Partial<Record<Muscle, number>>
  /** Accessory sets projected for the week, by muscle. */
  accessory: MuscleCounts
}

/** The extra sets each muscle is owed by the focuses in force; overlapping focuses take the larger. */
export function focusExtras(focuses: ReadonlyArray<Focus>, now: number): Partial<Record<Muscle, number>> {
  const extras: Partial<Record<Muscle, number>> = {}
  for (const f of focuses) {
    if (f.until !== undefined && f.until <= now) continue
    for (const m of f.muscles) extras[m] = Math.max(extras[m] ?? 0, f.extraSets)
  }
  return extras
}

/**
 * Muscles projected to finish the week short: today's muscles first (see
 * DayFocus), then focused ones, then biggest shortfall first. A focus
 * muscle still leads, but on a day it fits: chest work lands on upper
 * days, not squat day.
 *
 *
 * A focused muscle is short if it's under its normal target or if its
 * accessory sets are under the focus's extra sets, whichever gap is bigger.
 * Counting accessories separately is the point: main lifts already give
 * chest or glutes far more than their targets, so a higher target alone
 * would never surface them.
 */
export function behind(
  projected: MuscleCounts,
  targets: MuscleTargets,
  focus?: FocusState,
  /** Today's muscles; undefined for a Full day. */
  day?: ReadonlySet<Muscle>,
): Gap[] {
  return MUSCLES.flatMap((muscle): Gap[] => {
    const have = projected[muscle] ?? 0
    const extra = focus?.extras[muscle] ?? 0
    const focused = extra > 0
    const fitsDay = !day || day.has(muscle)
    let gap: Gap = { muscle, have, target: targets[muscle], gap: targets[muscle] - have, kind: 'target', focused, fitsDay }
    if (focused) {
      const accessory = focus!.accessory[muscle] ?? 0
      if (extra - accessory > gap.gap) {
        gap = { muscle, have: accessory, target: extra, gap: extra - accessory, kind: 'focus', focused, fitsDay }
      }
    }
    return gap.gap > 0 ? [gap] : []
  }).sort(
    (a, b) =>
      Number(b.fitsDay) - Number(a.fitsDay) ||
      Number(b.focused) - Number(a.focused) ||
      b.gap - a.gap ||
      MUSCLES.indexOf(a.muscle) - MUSCLES.indexOf(b.muscle),
  )
}

export function restricts(r: Restriction, e: Exercise): boolean {
  if (r.lowerBack && e.lowerBack) return true
  if (r.tags.some((t) => e.tags?.includes(t))) return true
  if (r.patterns.includes(e.pattern)) return true
  return r.muscles.some((m) => e.muscles[m] === 1)
}

export function activeRestrictions<R extends Restriction>(list: ReadonlyArray<R>, now: number): R[] {
  return list.filter((r) => r.until === undefined || r.until > now)
}

/** Unrated exercises sort as if they had this many stars. */
export const UNRATED_STARS = 3

export interface SuggestInput {
  exercises: ReadonlyArray<Exercise>
  ratings: ReadonlyMap<string, Rating>
  equipment: ReadonlySet<Equipment>
  /** Already narrowed to the ones in force. */
  restrictions: ReadonlyArray<Restriction>
  gaps: ReadonlyArray<Gap>
  /** In today's plan already. */
  exclude: ReadonlySet<string>
  /** When each exercise was last done, epoch ms. */
  lastDone: ReadonlyMap<string, number>
  /** Narrow to one behind muscle. */
  only?: Muscle
  sort: 'rating' | 'fit'
  /** Today's accessory focus. Exercises for its muscles rank first. */
  day?: DayFocus
}

export interface Suggestion {
  exercise: Exercise
  stars: number
  rated: boolean
  /** The behind muscles it works. */
  hits: Gap[]
  coverage: number
  lastDone?: number
  /** Works one of today's muscles as a primary mover. */
  fitsDay: boolean
  /** Loads the lower back on a Posterior day, which the deadlift has already done. */
  backHeavy: boolean
}

/** Could this person do this exercise here and now, rating and restrictions aside from gaps? */
export function usable(e: Exercise, input: Pick<SuggestInput, 'ratings' | 'equipment' | 'restrictions' | 'exclude'>): boolean {
  if (input.ratings.get(e.id)?.hidden) return false
  if (input.exclude.has(e.id)) return false
  if (!e.equipment.every((item) => input.equipment.has(item))) return false
  return !input.restrictions.some((r) => restricts(r, e))
}

/**
 * How much of the week's shortfall the exercise addresses, each muscle's
 * gap taken relative to its target so a small muscle's gap isn't drowned
 * out by a big one's.
 */
export function coverage(e: Exercise, gaps: ReadonlyArray<Gap>): number {
  return gaps.reduce((sum, g) => sum + (e.muscles[g.muscle] ?? 0) * (g.gap / g.target), 0)
}

function toSuggestion(e: Exercise, gaps: ReadonlyArray<Gap>, input: SuggestInput): Suggestion {
  const rating = input.ratings.get(e.id)
  const day = input.day ? focusMuscles(input.day) : undefined
  return {
    exercise: e,
    stars: rating?.stars ?? UNRATED_STARS,
    rated: rating?.stars !== undefined,
    hits: gaps.filter((g) => (e.muscles[g.muscle] ?? 0) > 0),
    coverage: coverage(e, gaps),
    lastDone: input.lastDone.get(e.id),
    fitsDay: !day || MUSCLES.some((m) => day.has(m) && e.muscles[m] === 1),
    backHeavy: input.day === 'posterior' && e.lowerBack !== undefined,
  }
}

/** Today's muscles first; on a Posterior day, ones that spare the lower back before ones that don't. */
function byDay(a: Suggestion, b: Suggestion): number {
  return Number(b.fitsDay) - Number(a.fitsDay) || Number(a.backHeavy) - Number(b.backHeavy)
}

/** Rating first; then whichever covers more; then whichever was done longest ago. */
function byRating(a: Suggestion, b: Suggestion): number {
  return (
    byDay(a, b) ||
    b.stars - a.stars ||
    b.coverage - a.coverage ||
    (a.lastDone ?? 0) - (b.lastDone ?? 0) ||
    a.exercise.name.localeCompare(b.exercise.name)
  )
}

/** Coverage scaled by rating: a 5★ counts 5/3 as much as an unrated one, a 1★ a third. */
function byFit(a: Suggestion, b: Suggestion): number {
  const score = (s: Suggestion) => (s.coverage * s.stars) / UNRATED_STARS
  return byDay(a, b) || score(b) - score(a) || byRating(a, b)
}

/** Exercises with a behind muscle as a primary mover, best first. */
export function suggest(input: SuggestInput): Suggestion[] {
  const gaps = input.only ? input.gaps.filter((g) => g.muscle === input.only) : input.gaps
  const wanted = new Set(gaps.map((g) => g.muscle))
  return input.exercises
    .filter((e) => usable(e, input) && MUSCLES.some((m) => wanted.has(m) && e.muscles[m] === 1))
    .map((e) => toSuggestion(e, gaps, input))
    .sort(input.sort === 'fit' ? byFit : byRating)
}

/** Every usable exercise matching a search, best rated first. */
export function search(input: SuggestInput, query: string): Suggestion[] {
  const q = query.trim().toLowerCase()
  return input.exercises
    .filter((e) => usable(e, input) && e.name.toLowerCase().includes(q))
    .map((e) => toSuggestion(e, input.gaps, input))
    .sort(byRating)
}

/**
 * Fills `slots` empty accessory slots one at a time. Each goes to the
 * biggest gap that hasn't had a slot today, with that gap's top-rated
 * exercise; its sets go into the projection before the next slot looks
 * again. A muscle only gets a second slot once every gap has one.
 *
 * "Biggest gap" alone isn't enough: a chin-up's half set of biceps shrinks
 * that gap, and lats would win the next slot too.
 */
export function fillSlots(
  input: Omit<SuggestInput, 'gaps' | 'only' | 'sort'> & {
    projected: MuscleCounts
    targets: MuscleTargets
    focus?: FocusState
    /** Primary muscles of accessories already picked today. */
    usedToday?: ReadonlyArray<Muscle>
    day?: DayFocus
  },
  slots: number,
): Exercise[] {
  let projected = input.projected
  let focus = input.focus
  const exclude = new Set(input.exclude)
  const used = new Set(input.usedToday)
  const picked: Exercise[] = []
  for (let i = 0; i < slots; i++) {
    const gaps = behind(projected, input.targets, focus, input.day ? focusMuscles(input.day) : undefined)
    // Today's muscles take every slot while any are behind, each getting one
    // before any gets a second; only then do other muscles get a turn.
    const rank = (g: Gap) => (g.fitsDay ? 0 : 2) + (used.has(g.muscle) ? 1 : 0)
    const order = [...gaps].sort((a, b) => rank(a) - rank(b))
    // A gap with nothing usable for it (all hidden, say) passes to the next.
    let best: { suggestion: Suggestion; muscle: Muscle } | undefined
    for (const gap of order) {
      const top = suggest({ ...input, exclude, gaps, only: gap.muscle, sort: 'rating' })[0]
      if (top) {
        best = { suggestion: top, muscle: gap.muscle }
        break
      }
    }
    if (!best) break
    const exercise = best.suggestion.exercise
    picked.push(exercise)
    exclude.add(exercise.id)
    used.add(best.muscle)
    projected = withExercise(projected, exercise, exercise.sets)
    // Fill all only ever adds accessories, so they count toward a focus too.
    if (focus) focus = { ...focus, accessory: withExercise(focus.accessory, exercise, exercise.sets) }
  }
  return picked
}
