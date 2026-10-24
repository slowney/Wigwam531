import { useState } from 'react'
import { addCustomExercise, toNewExercise, updateCustomExercise, type NewExercise } from '../../db/library.ts'
import {
  MUSCLE_LABELS,
  MUSCLES,
  type Equipment,
  type Exercise,
  type LoadType,
  type Muscle,
  type Pattern,
  type Tag,
} from '../../engine/types.ts'
import { Stepper } from './forms.tsx'
import { Sheet } from './Sheet.tsx'

const LOADS: { value: LoadType; label: string }[] = [
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'cable', label: 'Cable' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
  { value: 'ezBar', label: 'EZ bar' },
  { value: 'trapBar', label: 'Trap bar' },
  { value: 'landmine', label: 'Landmine' },
]

// Movement types map onto the patterns and tags restrictions look at.
const MOVES: { value: string; label: string; pattern: Pattern; tags?: Tag[] }[] = [
  { value: 'isolation', label: 'Isolation', pattern: 'isolation' },
  { value: 'press', label: 'Press', pattern: 'horizontalPush' },
  { value: 'overhead', label: 'Overhead', pattern: 'verticalPush', tags: ['overhead'] },
  { value: 'row', label: 'Row', pattern: 'horizontalPull' },
  { value: 'pulldown', label: 'Pull-down/up', pattern: 'verticalPull' },
  { value: 'squat', label: 'Squat', pattern: 'squat' },
  { value: 'lunge', label: 'Lunge', pattern: 'lunge' },
  { value: 'hinge', label: 'Hinge', pattern: 'hinge' },
  { value: 'core', label: 'Core', pattern: 'core' },
  { value: 'carry', label: 'Carry', pattern: 'carry' },
]

const EXTRAS: { value: Equipment; label: string }[] = [
  { value: 'bench', label: 'Bench' },
  { value: 'inclineBench', label: 'Incline bench' },
  { value: 'rack', label: 'Rack' },
  { value: 'pullupBar', label: 'Pull-up bar' },
  { value: 'dipBars', label: 'Dip bars' },
  { value: 'abWheel', label: 'Ab wheel' },
  { value: 'abMat', label: 'Ab mat' },
]

// Tags the form sets itself. Any others on an exercise being edited are kept as they are.
const FORM_TAGS: Tag[] = ['overhead', 'shoulderRisk']

function Chips<T extends string>(props: {
  label: string
  options: ReadonlyArray<{ value: T; label: string }>
  selected: ReadonlyArray<T>
  onToggle: (value: T) => void
  disabled?: (value: T) => boolean
}) {
  return (
    <div className="field">
      <span className="label">{props.label}</span>
      <div className="chips">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={props.selected.includes(o.value)}
            disabled={props.disabled?.(o.value)}
            className={props.selected.includes(o.value) ? 'chip chip-on' : 'chip'}
            onClick={() => props.onToggle(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function moveOf(input: NewExercise): string {
  const overhead = input.tags.includes('overhead')
  return MOVES.find((m) => m.pattern === input.pattern && (m.tags?.includes('overhead') ?? false) === overhead)?.value ?? 'isolation'
}

/**
 * About fifteen seconds, mid-workout: the essentials. The library opens the
 * same form with `editing` to change one of these later.
 */
export function QuickAddSheet(props: {
  name?: string
  editing?: Exercise
  saveLabel?: string
  onClose: () => void
  onSaved: (exercise: Exercise) => void
}) {
  const [start] = useState(() => (props.editing ? toNewExercise(props.editing) : undefined))
  const [name, setName] = useState(start?.name ?? props.name ?? '')
  const [load, setLoad] = useState<LoadType>(start?.load ?? 'dumbbell')
  const [move, setMove] = useState(start ? moveOf(start) : 'isolation')
  const [extras, setExtras] = useState<Equipment[]>(start?.extraEquipment ?? [])
  const [primary, setPrimary] = useState<Muscle[]>(start?.primary ?? [])
  const [secondary, setSecondary] = useState<Muscle[]>(start?.secondary ?? [])
  const [sets, setSets] = useState(start?.sets ?? 3)
  const [low, setLow] = useState(start?.reps[0] ?? 8)
  const [high, setHigh] = useState(start?.reps[1] ?? 12)
  const [seconds, setSeconds] = useState(start?.seconds ?? false)
  const [shoulderRisk, setShoulderRisk] = useState(start?.tags.includes('shoulderRisk') ?? false)
  const [lowerBack, setLowerBack] = useState(start?.lowerBack ?? false)
  const [error, setError] = useState<string>()

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  const muscleOptions = MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))
  const moveDef = MOVES.find((m) => m.value === move)!

  async function save() {
    setError(undefined)
    const input: NewExercise = {
      name,
      load,
      extraEquipment: extras,
      pattern: moveDef.pattern,
      primary,
      secondary: secondary.filter((m) => !primary.includes(m)),
      sets,
      reps: [low, high],
      seconds,
      tags: [
        ...(start?.tags.filter((t) => !FORM_TAGS.includes(t)) ?? []),
        ...(moveDef.tags ?? []),
        ...(shoulderRisk ? (['shoulderRisk'] as Tag[]) : []),
      ],
      lowerBack,
    }
    try {
      props.onSaved(props.editing ? await updateCustomExercise(props.editing.id, input) : await addCustomExercise(input))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={props.editing ? 'Edit exercise' : 'New exercise'} onClose={props.onClose}>
      <div className="field">
        <label className="label" htmlFor="new-exercise-name">
          Name
        </label>
        <input id="new-exercise-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Chips label="Loaded with" options={LOADS} selected={[load]} onToggle={setLoad} />
      <Chips label="Movement" options={MOVES} selected={[move]} onToggle={setMove} />
      <Chips label="Also needs" options={EXTRAS} selected={extras} onToggle={(v) => setExtras(toggle(extras, v))} />
      <Chips
        label="Main muscles"
        options={muscleOptions}
        selected={primary}
        onToggle={(m) => setPrimary(toggle(primary, m))}
      />
      <Chips
        label="Also works"
        options={muscleOptions}
        selected={secondary}
        onToggle={(m) => setSecondary(toggle(secondary, m))}
        disabled={(m) => primary.includes(m)}
      />
      <div className="counts">
        <Stepper label="Sets" value={sets} min={1} onChange={setSets} />
        <Stepper
          label={seconds ? 'Seconds from' : 'Reps from'}
          value={low}
          min={1}
          onChange={(n) => {
            setLow(n)
            if (n > high) setHigh(n)
          }}
        />
        <Stepper label="to" value={high} min={low} onChange={setHigh} />
      </div>
      <label className="toggle">
        <input type="checkbox" checked={seconds} onChange={(e) => setSeconds(e.target.checked)} /> Timed hold (seconds)
      </label>
      <label className="toggle">
        <input type="checkbox" checked={lowerBack} onChange={(e) => setLowerBack(e.target.checked)} /> Hard on the lower
        back
      </label>
      <label className="toggle">
        <input type="checkbox" checked={shoulderRisk} onChange={(e) => setShoulderRisk(e.target.checked)} /> Shoulder
        impingement risk
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn grow" onClick={() => void save()}>
          {props.saveLabel ?? (props.editing ? 'Save' : 'Add and use it')}
        </button>
      </div>
    </Sheet>
  )
}
