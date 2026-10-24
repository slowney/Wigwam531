// Accessory suggestions: which muscles are behind for the week, which
// exercises would help, in what order, and how "Fill all" spends the slots.
import { withExercise, type MuscleCounts } from './volume.ts'
import {
  MUSCLES,
  type Equipment,
  type Exercise,
  type Muscle,
  type MuscleTargets,
  type Rating,
  type Restriction,
} from './types.ts'

export interface Gap {
  muscle: Muscle
  /** Projected weighted sets for the week. */
  have: number
  target: number
  gap: number
}

/** Muscles projected to finish the week under target, biggest shortfall first. */
export function behind(projected: MuscleCounts, targets: MuscleTargets): Gap[] {
  return MUSCLES.map((muscle) => {
    const have = projected[muscle] ?? 0
    const target = targets[muscle]
    return { muscle, have, target, gap: target - have }
  })
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap || MUSCLES.indexOf(a.muscle) - MUSCLES.indexOf(b.muscle))
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
  focus?: Muscle
  sort: 'rating' | 'fit'
}

export interface Suggestion {
  exercise: Exercise
  stars: number
  rated: boolean
  /** The behind muscles it works. */
  hits: Gap[]
  coverage: number
  lastDone?: number
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
  return {
    exercise: e,
    stars: rating?.stars ?? UNRATED_STARS,
    rated: rating?.stars !== undefined,
    hits: gaps.filter((g) => (e.muscles[g.muscle] ?? 0) > 0),
    coverage: coverage(e, gaps),
    lastDone: input.lastDone.get(e.id),
  }
}

/** Rating first; then whichever covers more; then whichever was done longest ago. */
function byRating(a: Suggestion, b: Suggestion): number {
  return (
    b.stars - a.stars ||
    b.coverage - a.coverage ||
    (a.lastDone ?? 0) - (b.lastDone ?? 0) ||
    a.exercise.name.localeCompare(b.exercise.name)
  )
}

/** Coverage scaled by rating: a 5★ counts 5/3 as much as an unrated one, a 1★ a third. */
function byFit(a: Suggestion, b: Suggestion): number {
  const score = (s: Suggestion) => (s.coverage * s.stars) / UNRATED_STARS
  return score(b) - score(a) || byRating(a, b)
}

/** Exercises with a behind muscle as a primary mover, best first. */
export function suggest(input: SuggestInput): Suggestion[] {
  const gaps = input.focus ? input.gaps.filter((g) => g.muscle === input.focus) : input.gaps
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
  input: Omit<SuggestInput, 'gaps' | 'focus' | 'sort'> & {
    projected: MuscleCounts
    targets: MuscleTargets
    /** Primary muscles of accessories already picked today. */
    usedToday?: ReadonlyArray<Muscle>
  },
  slots: number,
): Exercise[] {
  let projected = input.projected
  const exclude = new Set(input.exclude)
  const used = new Set(input.usedToday)
  const picked: Exercise[] = []
  for (let i = 0; i < slots; i++) {
    const gaps = behind(projected, input.targets)
    const order = [...gaps.filter((g) => !used.has(g.muscle)), ...gaps.filter((g) => used.has(g.muscle))]
    // A gap with nothing usable for it (all hidden, say) passes to the next.
    let best: { suggestion: Suggestion; muscle: Muscle } | undefined
    for (const gap of order) {
      const top = suggest({ ...input, exclude, gaps, focus: gap.muscle, sort: 'rating' })[0]
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
  }
  return picked
}
