import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useParams } from 'react-router'
import { allExercises } from '../../data/exercises.ts'
import { db } from '../../db/db.ts'
import { loadRatings, setRating } from '../../db/library.ts'
import { MUSCLE_LABELS, MUSCLES, type Exercise, type Muscle } from '../../engine/types.ts'
import { BackLink, Segmented } from '../components/forms.tsx'
import { StarPicker } from '../components/RatingSheet.tsx'

const primaryMuscle = (e: Exercise): Muscle => MUSCLES.find((m) => e.muscles[m] === 1) ?? 'abs'

type Show = 'all' | 'rated' | 'new' | 'hidden'

/** Every exercise with this person's rating, to set or change in one place. */
export function ExerciseRatings() {
  const { id = '' } = useParams()
  const data = useLiveQuery(async () => ({ profile: await db.profiles.get(id), ratings: await loadRatings(id) }), [id])
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  if (!data) return null
  const { profile, ratings } = data
  if (!profile) return <p className="muted">That profile doesn't exist.</p>

  const q = query.trim().toLowerCase()
  const list = allExercises().filter((e) => {
    const r = ratings.get(e.id)
    if (q && !e.name.toLowerCase().includes(q)) return false
    if (show === 'rated') return r?.stars !== undefined && !r.hidden
    if (show === 'new') return r?.stars === undefined && !r?.hidden
    if (show === 'hidden') return r?.hidden === true
    return true
  })
  const groups = MUSCLES.map((m) => ({ muscle: m, items: list.filter((e) => primaryMuscle(e) === m) })).filter(
    (g) => g.items.length > 0,
  )

  return (
    <>
      <BackLink to={`/profiles/${id}`} label={profile.name} />
      <h1>Exercise ratings</h1>
      <p className="muted">
        Suggestions sort by these. Unrated exercises count as 3 stars. Hidden ones never get suggested, but stay
        searchable.
      </p>
      <input
        className="input search"
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Segmented
        label="Show"
        value={show}
        onChange={setShow}
        options={[
          { value: 'all', label: 'All' },
          { value: 'rated', label: 'Rated' },
          { value: 'new', label: 'New' },
          { value: 'hidden', label: 'Hidden' },
        ]}
      />
      {groups.map((g) => (
        <section key={g.muscle} className="card rating-group">
          <h2>{MUSCLE_LABELS[g.muscle]}</h2>
          {g.items.map((e) => {
            const r = ratings.get(e.id)
            return (
              <div key={e.id} className={r?.hidden ? 'rating-row rating-hidden' : 'rating-row'}>
                <span className="grow">
                  {e.name}
                  {e.id.startsWith('custom-') && <span className="badge"> yours</span>}
                </span>
                {!r?.hidden && (
                  <StarPicker
                    label={`Rate ${e.name}`}
                    stars={r?.stars}
                    onChange={(stars) => void setRating(id, e.id, { stars })}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  onClick={() => void setRating(id, e.id, { hidden: !r?.hidden })}
                >
                  {r?.hidden ? 'Unhide' : 'Hide'}
                </button>
              </div>
            )
          })}
        </section>
      ))}
      {groups.length === 0 && <p className="muted">Nothing here.</p>}
    </>
  )
}
