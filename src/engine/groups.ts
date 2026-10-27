import type { AccessoryGroup } from './program.ts'
import type { Gap } from './suggest.ts'
import type { ExerciseLookup, Muscle } from './types.ts'

export interface RankedGroup {
  group: AccessoryGroup
  /** The average "How was it?" rating of workouts that used it. */
  rating?: number
  uses: number
  /** Muscles behind this week that its exercises work as a primary mover. */
  hits: Muscle[]
  /** Share of its exercises that work today's muscles (see DayFocus). */
  fitsDay: number
  score: number
}

/** A group nobody has rated yet ranks as a 3, in the middle, so it gets tried. */
const UNRATED = 3

/**
 * A day's accessory groups, best first: by how the workouts that used them
 * went, nudged up by how much of each group works muscles that are behind
 * this week (up to a full star, when all of it does) and how much fits
 * today's focus (another star).
 */
export function rankGroups(
  groups: ReadonlyArray<AccessoryGroup>,
  workouts: ReadonlyArray<{ groups?: readonly string[]; rating?: number }>,
  gaps: ReadonlyArray<Gap>,
  lookup: ExerciseLookup,
  /** Today's muscles; undefined for a Full day. */
  day?: ReadonlySet<Muscle>,
): RankedGroup[] {
  const behind = new Set(gaps.map((g) => g.muscle))
  return groups
    .map((group) => {
      const used = workouts.filter((w) => w.groups?.includes(group.id))
      const rated = used.flatMap((w) => (w.rating !== undefined ? [w.rating] : []))
      const rating = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : undefined
      const primaries = group.items.map((i) =>
        Object.entries(lookup(i.exerciseId)?.muscles ?? {})
          .filter(([, w]) => w === 1)
          .map(([m]) => m as Muscle),
      )
      const hits = [...new Set(primaries.flat().filter((m) => behind.has(m)))]
      const fit = primaries.filter((ms) => ms.some((m) => behind.has(m))).length / Math.max(1, group.items.length)
      const fitsDay = day ? primaries.filter((ms) => ms.some((m) => day.has(m))).length / Math.max(1, group.items.length) : 1
      return { group, rating, uses: used.length, hits, fitsDay, score: (rating ?? UNRATED) + fit + fitsDay }
    })
    .sort((a, b) => b.score - a.score || a.group.name.localeCompare(b.group.name))
}
