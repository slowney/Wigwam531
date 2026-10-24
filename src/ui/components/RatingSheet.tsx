import { useLiveQuery } from 'dexie-react-hooks'
import { findExercise } from '../../data/exercises.ts'
import { db } from '../../db/db.ts'
import { setRating } from '../../db/library.ts'
import type { Stars } from '../../engine/types.ts'
import { Sheet } from './Sheet.tsx'

const STARS: Stars[] = [1, 2, 3, 4, 5]

/** Tap-to-rate stars. Tapping the current rating again clears it. */
export function StarPicker(props: { stars?: Stars; onChange: (stars: Stars | null) => void; label: string }) {
  return (
    <div className="stars" role="radiogroup" aria-label={props.label}>
      {STARS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={props.stars === s}
          aria-label={`${s} star${s === 1 ? '' : 's'}`}
          className={props.stars !== undefined && s <= props.stars ? 'star star-on' : 'star'}
          onClick={() => props.onChange(props.stars === s ? null : s)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function RatingSheet(props: { profileId: string; exerciseId: string; onClose: () => void }) {
  const rating = useLiveQuery(
    async () => (await db.ratings.get([props.profileId, props.exerciseId])) ?? null,
    [props.profileId, props.exerciseId],
  )
  const exercise = findExercise(props.exerciseId)
  if (rating === undefined) return null
  const hidden = rating?.hidden ?? false

  return (
    <Sheet title={exercise?.name ?? 'Exercise'} onClose={props.onClose}>
      <p className="muted small no-margin">
        {rating?.stars ? 'Your rating' : 'Not rated yet, so it sorts like 3 stars.'} Low ratings sink to the bottom
        of suggestions without disappearing.
      </p>
      <StarPicker
        label="Rating"
        stars={rating?.stars}
        onChange={(stars) => void setRating(props.profileId, props.exerciseId, { stars })}
      />
      <button
        type="button"
        className="btn btn-quiet hide-btn"
        onClick={() => void setRating(props.profileId, props.exerciseId, { hidden: !hidden })}
      >
        {hidden ? 'Show in suggestions again' : 'Hide from suggestions'}
      </button>
    </Sheet>
  )
}
