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
  /**
   * Shown above the rest, in this order: a slot's alternates, say. `detail`
   * replaces the usual sets x reps when they'd run differently there.
   */
  first?: { label: string; ids: ReadonlyArray<string>; detail?: (exerciseId: string) => string | undefined }
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = allExercises().filter(
    (e) => !props.hidden.has(e.id) && !props.exclude?.has(e.id) && (!q || e.name.toLowerCase().includes(q)),
  )
  const top = (props.first?.ids ?? []).flatMap((id) => matches.filter((e) => e.id === id))
  const groups = [
    ...(top.length ? [{ key: 'first', label: props.first!.label, items: top }] : []),
    ...MUSCLES.map((m) => ({ key: m, label: MUSCLE_LABELS[m], items: matches.filter((e) => primaryMuscle(e) === m) })),
  ].filter((g) => g.items.length > 0)
  const detailFor = (groupKey: string, e: Exercise) =>
    (groupKey === 'first' && props.first?.detail?.(e.id)) ||
    `${e.sets} × ${e.reps[0]}–${e.reps[1]}${e.unit === 'seconds' ? ' s' : ''}`

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
          <section key={g.key}>
            <h3 className="picker-group">{g.label}</h3>
            {g.items.map((e) => (
              <button key={e.id} type="button" className="picker-item" onClick={() => props.onPick(e.id)}>
                <span className="grow">{e.name}</span>
                <span className="muted small">{detailFor(g.key, e)}</span>
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className="muted">Nothing matches.</p>}
      </div>
    </Sheet>
  )
}
