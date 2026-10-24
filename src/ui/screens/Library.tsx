import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { allExercises, findExercise } from '../../data/exercises.ts'
import { allSchemes } from '../../data/schemes.ts'
import { db, type TemplateRow } from '../../db/db.ts'
import { deleteCustomExercise, exerciseUse } from '../../db/library.ts'
import { deleteTemplate, loadTemplates, renameTemplate } from '../../db/programs.ts'
import { dayLabel } from '../../engine/program.ts'
import type { PercentScheme } from '../../engine/schemes.ts'
import { MUSCLE_LABELS, MUSCLES, type Exercise, type Muscle } from '../../engine/types.ts'
import { BackLink, ConfirmButton } from '../components/forms.tsx'
import { QuickAddSheet } from '../components/QuickAddSheet.tsx'
import { SchemeEditor, SchemeView, useCustomSchemeIds } from '../components/SchemeSheets.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { repRange, schemeSummary } from '../format.ts'

// Settings › Exercises, Set schemes and My programs. Built-in exercises and
// schemes ship in code and can only be looked at (or copied); the ones made
// in the app can be changed.

const primaryMuscle = (e: Exercise): Muscle => MUSCLES.find((m) => e.muscles[m] === 1) ?? 'abs'

const muscleList = (e: Exercise, weight: 1 | 0.5) =>
  MUSCLES.filter((m) => e.muscles[m] === weight)
    .map((m) => MUSCLE_LABELS[m].toLowerCase())
    .join(', ')

export function ExerciseLibrary() {
  const custom = useLiveQuery(async () => new Set(await db.exercises.toCollection().primaryKeys()), [])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Exercise | 'new'>()
  if (!custom) return null

  const q = query.trim().toLowerCase()
  const matches = allExercises().filter((e) => !q || e.name.toLowerCase().includes(q))
  const groups = MUSCLES.map((m) => ({ muscle: m, items: matches.filter((e) => primaryMuscle(e) === m) })).filter(
    (g) => g.items.length > 0,
  )

  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <h1>Exercises</h1>
      <p className="muted small">
        Tap one to see it. The ones added in the app can be changed; the built-in ones can be hidden per person in their
        exercise ratings.
      </p>
      <button type="button" className="btn btn-quiet btn-wide" onClick={() => setOpen('new')}>
        + New exercise
      </button>
      <input
        className="input search"
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.map((g) => (
        <section key={g.muscle}>
          <h3 className="picker-group">{MUSCLE_LABELS[g.muscle]}</h3>
          {g.items.map((e) => (
            <button key={e.id} type="button" className="picker-item" onClick={() => setOpen(e)}>
              <span className="grow">
                {e.name}
                {custom.has(e.id) && <span className="muted small"> · yours</span>}
              </span>
              <span className="muted small">
                {e.sets} × {repRange(e.reps)}
                {e.unit === 'seconds' ? ' s' : ''}
              </span>
            </button>
          ))}
        </section>
      ))}
      {groups.length === 0 && <p className="muted">Nothing matches.</p>}

      {open === 'new' && <QuickAddSheet saveLabel="Add" onClose={() => setOpen(undefined)} onSaved={() => setOpen(undefined)} />}
      {open && open !== 'new' && custom.has(open.id) && <CustomExerciseSheet exercise={open} onClose={() => setOpen(undefined)} />}
      {open && open !== 'new' && !custom.has(open.id) && <ExerciseView exercise={open} onClose={() => setOpen(undefined)} />}
    </>
  )
}

function ExerciseFacts({ exercise }: { exercise: Exercise }) {
  const secondary = muscleList(exercise, 0.5)
  return (
    <dl className="facts">
      <dt>Works</dt>
      <dd>
        {muscleList(exercise, 1)}
        {secondary ? `, and some ${secondary}` : ''}
      </dd>
      <dt>Needs</dt>
      <dd>{exercise.equipment.length ? exercise.equipment.join(', ') : 'nothing'}</dd>
      <dt>As an accessory</dt>
      <dd>
        {exercise.sets} × {repRange(exercise.reps)}
        {exercise.unit === 'seconds' ? ' seconds' : ''}
      </dd>
    </dl>
  )
}

function ExerciseView({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  return (
    <Sheet title={exercise.name} onClose={onClose}>
      <ExerciseFacts exercise={exercise} />
      <p className="muted small">Built-in exercises stay as they are, so fixes to them reach everyone.</p>
    </Sheet>
  )
}

/** One made in the app: change it (the id stays, so history keeps pointing at it), or delete it if nothing uses it. */
function CustomExerciseSheet({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const use = useLiveQuery(() => exerciseUse(exercise.id), [exercise.id])
  // The library's copy, so a save shows straight away.
  const current = findExercise(exercise.id) ?? exercise

  if (editing) return <QuickAddSheet editing={current} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />

  const inUse = use && (use.history || use.programs.length > 0)
  return (
    <Sheet title={current.name} onClose={onClose}>
      <ExerciseFacts exercise={current} />
      <div className="actions">
        <button type="button" className="btn grow" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
      <div className="sheet-foot">
        {use && !inUse && (
          <ConfirmButton
            label="Delete exercise"
            confirmLabel="Tap again to delete"
            onConfirm={() => deleteCustomExercise(exercise.id).then(onClose, (e: unknown) => setError((e as Error).message))}
          />
        )}
        {use?.history && <p className="muted small">It's in the workout history, so it stays.</p>}
        {use && !use.history && use.programs.length > 0 && (
          <p className="muted small">In {use.programs.join(', ')}. Take it out of those to delete it.</p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </Sheet>
  )
}

export function SchemeLibrary() {
  const custom = useCustomSchemeIds()
  // The registry is kept in step by App; this just re-renders when it changes.
  useLiveQuery(() => db.schemes.count(), [])
  const [open, setOpen] = useState<{ view?: PercentScheme; editing?: PercentScheme; from?: PercentScheme; blank?: true }>()
  const percents = allSchemes().filter((s): s is PercentScheme => s.kind === 'percent')
  const builtIn = percents.filter((s) => !custom.has(s.id))
  const mine = percents.filter((s) => custom.has(s.id))

  const row = (s: PercentScheme) => (
    <button
      key={s.id}
      type="button"
      className="picker-item"
      onClick={() => setOpen(custom.has(s.id) ? { editing: s } : { view: s })}
    >
      <span className="grow stack">
        <span>{s.name}</span>
        <span className="muted small">{schemeSummary(s)}</span>
      </span>
    </button>
  )

  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <h1>Set schemes</h1>
      <p className="muted small">
        Percent-of-TM schemes a main lift can run. Rep ranges (like 4 × 6–8) don't need one: pick any range on the lift
        itself.
      </p>
      <h3 className="picker-group">Yours</h3>
      {mine.length === 0 && <p className="muted small">None yet. Copy a built-in one, or start from scratch.</p>}
      {mine.map(row)}
      <button type="button" className="btn btn-quiet btn-wide add-new" onClick={() => setOpen({ blank: true })}>
        + New scheme
      </button>
      <h3 className="picker-group">Built in</h3>
      {builtIn.map(row)}

      {open?.view && (
        <SchemeView scheme={open.view} onClose={() => setOpen(undefined)} onCopy={() => setOpen({ from: open.view })} />
      )}
      {(open?.editing || open?.from || open?.blank) && (
        <SchemeEditor
          editing={open.editing}
          from={open.from}
          onClose={() => setOpen(undefined)}
          onSaved={() => setOpen(undefined)}
        />
      )}
    </>
  )
}

export function ProgramLibrary() {
  const templates = useLiveQuery(() => loadTemplates(), [])
  if (!templates) return null
  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <h1>My programs</h1>
      <p className="muted small">
        Programs saved from a profile's program editor. New profiles can start from one, and anyone can switch to one.
        Each profile runs its own copy, so changing or deleting these changes nobody's training.
      </p>
      {templates.length === 0 && (
        <p className="muted">None yet. Open a profile's program and use Save to My programs.</p>
      )}
      {templates.map((t) => (
        <TemplateCard key={t.id} template={t} />
      ))}
    </>
  )
}

function TemplateCard({ template }: { template: TemplateRow }) {
  const [renaming, setRenaming] = useState<string>()
  return (
    <section className="card">
      {renaming !== undefined ? (
        <div className="row">
          <input
            className="input grow"
            value={renaming}
            autoFocus
            aria-label="Program name"
            onChange={(e) => setRenaming(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void renameTemplate(template.id, renaming).then(() => setRenaming(undefined))}
          >
            Save
          </button>
        </div>
      ) : (
        <h2>{template.name}</h2>
      )}
      <ul className="plain-list muted small">
        {template.days.map((d) => (
          <li key={d.id}>{dayLabel(d, findExercise)}</li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setRenaming(template.name)}>
          Rename
        </button>
        <ConfirmButton small label="Delete" confirmLabel="Tap again to delete" onConfirm={() => void deleteTemplate(template.id)} />
      </div>
    </section>
  )
}
