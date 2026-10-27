import { useState, type ReactNode } from 'react'
import { search, suggest, type Gap, type Suggestion, type SuggestInput } from '../../engine/suggest.ts'
import { MUSCLE_LABELS, type Muscle } from '../../engine/types.ts'
import { Segmented } from './forms.tsx'
import { Sheet } from './Sheet.tsx'

const sets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** "Lats 4/10" for the weekly target; "Chest 0/3 focus" for a focus's extra accessory sets. */
export function gapText(g: Gap): string {
  return `${MUSCLE_LABELS[g.muscle]} ${sets(g.have)}/${sets(g.target)}${g.kind === 'focus' ? ' focus' : ''}`
}

function starsText(s: Suggestion): string {
  return s.rated ? `${s.stars}★` : 'new'
}

/**
 * Suggestions for one accessory slot: the muscles behind this week as
 * chips, exercises that help sorted by rating (or fit), and the whole
 * library one search away, with quick-add for anything that isn't in it.
 */
export function AccessoryPicker(props: {
  title: string
  base: Omit<SuggestInput, 'only' | 'sort'>
  /** "Oct 14 · 35 × 12, 12, 10", or undefined if never done. */
  lastTime: (exerciseId: string) => string | undefined
  /** Shown on rows hard on the lower back when a squat or deadlift day is next. */
  backDayNext?: string
  onPick: (exerciseId: string) => void
  onRate: (exerciseId: string) => void
  onAdd: (name: string) => void
  onClose: () => void
  footer?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<Muscle>()
  const [sort, setSort] = useState<'rating' | 'fit'>('rating')
  const q = query.trim()
  const results = q ? search({ ...props.base, sort }, q) : suggest({ ...props.base, only: focus, sort })
  const exact = q && results.some((s) => s.exercise.name.toLowerCase() === q.toLowerCase())

  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <input
        className="input search"
        placeholder="Search, or name something new"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!q && props.base.gaps.length > 0 && (
        <>
          <div className="chips gap-chips" role="radiogroup" aria-label="Behind this week">
            <button
              type="button"
              role="radio"
              aria-checked={focus === undefined}
              className={focus === undefined ? 'chip chip-on' : 'chip'}
              onClick={() => setFocus(undefined)}
            >
              All behind
            </button>
            {props.base.gaps.map((g) => (
              <button
                key={g.muscle}
                type="button"
                role="radio"
                aria-checked={focus === g.muscle}
                className={`chip${focus === g.muscle ? ' chip-on' : ''}${g.focused ? ' chip-focus' : ''}${g.fitsDay ? '' : ' chip-offday'}`}
                onClick={() => setFocus(focus === g.muscle ? undefined : g.muscle)}
              >
                {gapText(g)}
              </button>
            ))}
          </div>
          <Segmented
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'rating', label: 'Your ratings' },
              { value: 'fit', label: 'Best fit' },
            ]}
          />
        </>
      )}
      {props.footer}

      {!q && (
        <button type="button" className="btn btn-quiet add-new" onClick={() => props.onAdd('')}>
          + New exercise
        </button>
      )}
      {q && !exact && (
        <button type="button" className="btn btn-quiet add-new" onClick={() => props.onAdd(q)}>
          + Add “{q}” as a new exercise
        </button>
      )}

      <div className="picker-list">
        {results.map((s) => {
          const last = props.lastTime(s.exercise.id)
          const backNote = props.backDayNext && s.exercise.lowerBack ? `Lower back · ${props.backDayNext} next` : undefined
          return (
            <div key={s.exercise.id} className="sugg">
              <button type="button" className="sugg-main" onClick={() => props.onPick(s.exercise.id)}>
                <strong>{s.exercise.name}</strong>
                {s.hits.length > 0 && <span className="small">{s.hits.map(gapText).join(' · ')}</span>}
                {last && <span className="muted small">{last}</span>}
                {backNote && <span className="small warn-text">{backNote}</span>}
              </button>
              <button
                type="button"
                className={s.rated ? 'sugg-rate' : 'sugg-rate sugg-new'}
                aria-label={`Rate ${s.exercise.name}`}
                onClick={() => props.onRate(s.exercise.id)}
              >
                {starsText(s)}
              </button>
            </div>
          )
        })}
        {results.length === 0 && (
          <p className="muted">
            {q
              ? 'Nothing in the library matches.'
              : props.base.gaps.length === 0
                ? "Nothing's behind this week. Search to add anything."
                : 'Nothing usable for that muscle. Hidden exercises and restrictions can do that.'}
          </p>
        )}
      </div>
    </Sheet>
  )
}
