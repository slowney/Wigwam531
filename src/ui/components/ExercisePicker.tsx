import { useState, type ReactNode } from 'react'
import { allExercises } from '../../data/exercises.ts'
import { MUSCLE_LABELS, MUSCLES, type Exercise, type Muscle } from '../../engine/types.ts'
import { Sheet } from './Sheet.tsx'

const primaryMuscle = (e: Exercise): Muscle => MUSCLES.find((m) => e.muscles[m] === 1) ?? 'abs'

/** The whole library, grouped by main muscle and searchable. Suggestions come in Phase 4. */
export function ExercisePicker(props: {
  title: string
  /** This person's hidden exercises. */
  hidden: ReadonlySet<string>
  /** Already in today's plan. */
  exclude?: ReadonlySet<string>
  onPick: (exerciseId: string) => void
  onClose: () => void
  footer?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = allExercises().filter(
    (e) => !props.hidden.has(e.id) && !props.exclude?.has(e.id) && (!q || e.name.toLowerCase().includes(q)),
  )
  const groups = MUSCLES.map((m) => ({ muscle: m, items: matches.filter((e) => primaryMuscle(e) === m) })).filter(
    (g) => g.items.length > 0,
  )

  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <input
        className="input search"
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {props.footer}
      <div className="picker-list">
        {groups.map((g) => (
          <section key={g.muscle}>
            <h3 className="picker-group">{MUSCLE_LABELS[g.muscle]}</h3>
            {g.items.map((e) => (
              <button key={e.id} type="button" className="picker-item" onClick={() => props.onPick(e.id)}>
                <span className="grow">{e.name}</span>
                <span className="muted small">
                  {e.sets} × {e.reps[0]}–{e.reps[1]}
                  {e.unit === 'seconds' ? ' s' : ''}
                </span>
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className="muted">Nothing matches.</p>}
      </div>
    </Sheet>
  )
}
