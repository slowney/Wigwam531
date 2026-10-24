import { useState } from 'react'
import { addCustomExercise, type NewExercise } from '../../db/library.ts'
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

function Count(props: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <div className="count">
      <span className="label">{props.label}</span>
      <div className="tm-stepper">
        <button type="button" className="btn btn-quiet step" onClick={() => props.onChange(Math.max(props.min, props.value - 1))}>
          −
        </button>
        <output className="tm-value">{props.value}</output>
        <button type="button" className="btn btn-quiet step" onClick={() => props.onChange(props.value + 1)}>
          +
        </button>
      </div>
    </div>
  )
}

/** About fifteen seconds, mid-workout: the essentials, refined later in the library. */
export function QuickAddSheet(props: { name: string; onClose: () => void; onAdded: (exercise: Exercise) => void }) {
  const [name, setName] = useState(props.name)
  const [load, setLoad] = useState<LoadType>('dumbbell')
  const [move, setMove] = useState('isolation')
  const [extras, setExtras] = useState<Equipment[]>([])
  const [primary, setPrimary] = useState<Muscle[]>([])
  const [secondary, setSecondary] = useState<Muscle[]>([])
  const [sets, setSets] = useState(3)
  const [low, setLow] = useState(8)
  const [high, setHigh] = useState(12)
  const [seconds, setSeconds] = useState(false)
  const [shoulderRisk, setShoulderRisk] = useState(false)
  const [lowerBack, setLowerBack] = useState(false)
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
      tags: [...(moveDef.tags ?? []), ...(shoulderRisk ? (['shoulderRisk'] as Tag[]) : [])],
      lowerBack,
    }
    try {
      props.onAdded(await addCustomExercise(input))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title="New exercise" onClose={props.onClose}>
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
        <Count label="Sets" value={sets} min={1} onChange={setSets} />
        <Count label={seconds ? 'Seconds from' : 'Reps from'} value={low} min={1} onChange={(n) => { setLow(n); if (n > high) setHigh(n) }} />
        <Count label="to" value={high} min={low} onChange={setHigh} />
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
          Add and use it
        </button>
      </div>
    </Sheet>
  )
}
