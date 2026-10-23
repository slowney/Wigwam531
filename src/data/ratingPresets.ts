import type { Exercise, Rating } from '../engine/types.ts'

// A preset is a starting point applied once, when a profile is created.
// After that the ratings are the person's own.

export type RatingPresetId = 'dumbbell-first' | 'blank'

export const RATING_PRESETS: { id: RatingPresetId; name: string; description: string }[] = [
  {
    id: 'dumbbell-first',
    name: 'Dumbbell-first, shoulder-safe',
    description: 'Dumbbell accessories start at 4 stars. Upright rows, bench dips and behind-the-neck work are hidden.',
  },
  { id: 'blank', name: 'Start blank', description: 'Everything unrated until you rate it.' },
]

export function presetRatings(preset: RatingPresetId, exercises: ReadonlyArray<Exercise>): Rating[] {
  if (preset === 'blank') return []
  const ratings: Rating[] = []
  for (const e of exercises) {
    if (e.tags?.includes('shoulderRisk')) ratings.push({ exerciseId: e.id, hidden: true })
    // Everything else stays unrated: it sorts as 3 stars, and the session
    // summary can still ask for a first rating.
    else if (e.load === 'dumbbell') ratings.push({ exerciseId: e.id, stars: 4, hidden: false })
  }
  return ratings
}
