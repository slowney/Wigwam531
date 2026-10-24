import { useState } from 'react'
import { FOCUS_LEVELS, FOCUS_PRESETS } from '../../data/focusPresets.ts'
import { addFocus } from '../../db/profiles.ts'
import { MUSCLE_LABELS, MUSCLES, type Muscle } from '../../engine/types.ts'
import { ChoiceList, Segmented } from './forms.tsx'
import { Sheet } from './Sheet.tsx'

const WEEK = 7 * 24 * 60 * 60 * 1000

const muscleList = (muscles: Muscle[]) => muscles.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(', ')

export function FocusSheet(props: { profileId: string; onClose: () => void }) {
  const [choice, setChoice] = useState<string>(FOCUS_PRESETS[0]!.id)
  const [muscles, setMuscles] = useState<Muscle[]>([])
  const [level, setLevel] = useState<string>(String(FOCUS_LEVELS[0]!.sets))
  const [weeks, setWeeks] = useState<'0' | '4' | '8' | '12'>('0')
  const [error, setError] = useState<string>()

  async function save() {
    const preset = FOCUS_PRESETS.find((p) => p.id === choice)
    const picked = preset?.muscles ?? muscles
    try {
      await addFocus(props.profileId, {
        name: preset?.name ?? `Focus: ${muscleList(picked)}`,
        muscles: picked,
        extraSets: Number(level),
        ...(weeks === '0' ? {} : { until: Date.now() + Number(weeks) * WEEK }),
      })
      props.onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title="Add a focus" onClose={props.onClose}>
      <p className="muted small no-margin">
        Asks for extra accessory sets each week for these muscles, on top of what the main lifts already give them.
        Focus muscles come first in suggestions and Fill all until those sets are in.
      </p>
      <ChoiceList
        label="Focus"
        value={choice}
        onChange={setChoice}
        options={[
          ...FOCUS_PRESETS.map((p) => ({ value: p.id, title: p.name, description: muscleList(p.muscles) })),
          { value: 'custom', title: 'Pick muscles', description: 'Any mix you like.' },
        ]}
      />
      {choice === 'custom' && (
        <div className="chips custom-muscles">
          {MUSCLES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={muscles.includes(m)}
              className={muscles.includes(m) ? 'chip chip-on' : 'chip'}
              onClick={() => setMuscles(muscles.includes(m) ? muscles.filter((x) => x !== m) : [...muscles, m])}
            >
              {MUSCLE_LABELS[m]}
            </button>
          ))}
        </div>
      )}
      <div className="field">
        <span className="label">How much</span>
        <Segmented
          label="How much"
          value={level}
          onChange={setLevel}
          options={FOCUS_LEVELS.map((l) => ({ value: String(l.sets), label: `${l.label} (+${l.sets})` }))}
        />
        <span className="muted small">Extra sets a week per muscle. 3 is about one more accessory.</span>
      </div>
      <div className="field">
        <span className="label">For</span>
        <Segmented
          label="For how long"
          value={weeks}
          onChange={setWeeks}
          options={[
            { value: '0', label: 'Until removed' },
            { value: '4', label: '4 wks' },
            { value: '8', label: '8 wks' },
            { value: '12', label: '12 wks' },
          ]}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-big" onClick={() => void save()}>
        Add focus
      </button>
    </Sheet>
  )
}
