import { useState } from 'react'
import { RESTRICTION_PRESETS } from '../../data/restrictionPresets.ts'
import { addRestriction } from '../../db/restrictions.ts'
import { MUSCLE_LABELS, MUSCLES, type Muscle } from '../../engine/types.ts'
import { ChoiceList, Segmented } from './forms.tsx'
import { Sheet } from './Sheet.tsx'

const WEEK = 7 * 24 * 60 * 60 * 1000

export function RestrictionSheet(props: { profileId: string; onClose: () => void }) {
  const [choice, setChoice] = useState<string>(RESTRICTION_PRESETS[0]!.id)
  const [muscles, setMuscles] = useState<Muscle[]>([])
  const [weeks, setWeeks] = useState<'0' | '1' | '2' | '4'>('0')
  const [error, setError] = useState<string>()

  async function save() {
    const preset = RESTRICTION_PRESETS.find((p) => p.id === choice)
    if (!preset && muscles.length === 0) return setError('Pick at least one muscle.')
    const rule = preset?.rule ?? {
      name: `Avoid ${muscles.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(', ')}`,
      muscles,
      patterns: [],
      tags: [],
      lowerBack: false,
    }
    await addRestriction(props.profileId, rule, weeks === '0' ? undefined : Date.now() + Number(weeks) * WEEK)
    props.onClose()
  }

  return (
    <Sheet title="Add a restriction" onClose={props.onClose}>
      <p className="muted small no-margin">
        Suggestions leave out anything it covers, and main lifts it covers get a warning so you can swap them.
      </p>
      <ChoiceList
        label="Restriction"
        value={choice}
        onChange={setChoice}
        options={[
          ...RESTRICTION_PRESETS.map((p) => ({ value: p.id, title: p.rule.name, description: p.description })),
          { value: 'custom', title: 'Pick muscles', description: 'Leave out exercises that mainly work them.' },
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
        <span className="label">For</span>
        <Segmented
          label="For how long"
          value={weeks}
          onChange={setWeeks}
          options={[
            { value: '0', label: 'Until removed' },
            { value: '1', label: '1 wk' },
            { value: '2', label: '2 wks' },
            { value: '4', label: '4 wks' },
          ]}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-big" onClick={() => void save()}>
        Add restriction
      </button>
    </Sheet>
  )
}
