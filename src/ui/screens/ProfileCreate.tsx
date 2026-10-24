import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { RATING_PRESETS, type RatingPresetId } from '../../data/ratingPresets.ts'
import { findScheme } from '../../data/schemes.ts'
import { db, type ProfileRow, type TemplateRow } from '../../db/db.ts'
import { createProfile, loadTms, type ProgramChoice } from '../../db/profiles.ts'
import { loadTemplates } from '../../db/programs.ts'
import { requiredTms } from '../../engine/program.ts'
import { MAX_DAYS } from '../../engine/programEdit.ts'
import { tmFromOneRepMax } from '../../engine/weights.ts'
import {
  BackLink,
  ChoiceList,
  ColorPicker,
  PROFILE_COLORS,
  Segmented,
  Stepper,
  TextInput,
  WeightInput,
  parseLb,
} from '../components/forms.tsx'
import { optionProgram, programOptions, type Leader } from '../programChoices.ts'

export function ProfileCreate() {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray())
      .filter((p) => !p.archived)
      .sort((a, b) => a.createdAt - b.createdAt)
    const leaders: Leader[] = []
    for (const p of profiles) {
      const row = await db.programs.get(p.id)
      if (row?.program && !row.followsProfileId) leaders.push({ id: p.id, name: p.name, program: row.program })
    }
    return { profiles, leaders, templates: await loadTemplates() }
  }, [])
  if (!data) return null
  return (
    <CreateForm
      {...data}
      // A program built from scratch has nothing in it yet, so that's where they go next.
      onCreated={(id, blank) => navigate(blank ? `/profiles/${id}/program` : `/profiles/${id}`, { replace: true })}
    />
  )
}

function choiceOf(value: string, days: number): ProgramChoice {
  const [kind = '', id = ''] = value.split(':')
  if (kind === 'follow') return { kind: 'follow', leaderId: id }
  if (kind === 'template') return { kind: 'template', templateId: id }
  if (kind === 'blank') return { kind: 'blank', days }
  return { kind: 'preset', presetId: id }
}

function CreateForm(props: {
  profiles: ProfileRow[]
  leaders: Leader[]
  templates: TemplateRow[]
  onCreated: (id: string, blank: boolean) => void
}) {
  const { profiles, leaders, templates } = props

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(
    () => PROFILE_COLORS.find((c) => !profiles.some((p) => p.color === c.value))?.value ?? PROFILE_COLORS[0].value,
  )
  // Partners usually follow; the first profile starts its own program.
  const [choice, setChoice] = useState(leaders[0] ? `follow:${leaders[0].id}` : 'preset:nsuns-4day-row')
  const [days, setDays] = useState(4)
  const [mode, setMode] = useState<'tm' | 'oneRepMax'>('tm')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [ratingPreset, setRatingPreset] = useState<RatingPresetId>(profiles.length === 0 ? 'dumbbell-first' : 'blank')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const program = choiceOf(choice, days)
  const leaderId = program.kind === 'follow' ? program.leaderId : undefined
  const leader = profiles.find((p) => p.id === leaderId)
  const chosen = optionProgram(choice, leaders, templates)
  const lifts = chosen ? requiredTms(chosen, findScheme) : []
  const leaderTms = useLiveQuery(() => (leaderId ? loadTms(leaderId) : undefined), [leaderId])

  const tmFor = (id: string) => {
    const value = parseLb(inputs[id] ?? '')
    if (value === undefined) return undefined
    return mode === 'oneRepMax' ? tmFromOneRepMax(value) : value
  }

  async function save() {
    setError(undefined)
    setSaving(true)
    try {
      const tms: Record<string, number> = {}
      for (const id of lifts) {
        const tm = tmFor(id)
        if (tm !== undefined) tms[id] = tm
      }
      props.onCreated(await createProfile({ name, color, program, tms, ratingPreset }), program.kind === 'blank')
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <>
      <BackLink to="/profiles" label="Profiles" />
      <h1>New profile</h1>

      <section className="card">
        <TextInput label="Name" value={name} onChange={setName} placeholder="First name" />
        <div className="field">
          <span className="label">Color</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </section>

      <section className="card">
        <h2>Program</h2>
        <ChoiceList
          label="Program"
          value={choice}
          onChange={setChoice}
          options={programOptions({ leaders, templates, follow: true, copy: false })}
        />
        {program.kind === 'blank' && (
          <div className="counts counts-spaced">
            <Stepper label="Days" value={days} min={1} max={MAX_DAYS} onChange={setDays} />
          </div>
        )}
      </section>

      {program.kind === 'blank' ? (
        <section className="card">
          <h2>Training maxes</h2>
          <p className="muted small no-margin">
            The program editor opens next to add lifts. TMs for them go on the profile once the lifts are in.
          </p>
        </section>
      ) : (
        <section className="card">
          <h2>Training maxes</h2>
          <Segmented
            label="Enter as"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'tm', label: 'TMs' },
              { value: 'oneRepMax', label: '1RMs' },
            ]}
          />
          {leader && leaderTms && Object.keys(leaderTms).length > 0 && (
            <button
              type="button"
              className="btn btn-quiet copy-tms"
              onClick={() => {
                setMode('tm')
                setInputs(Object.fromEntries(lifts.map((id) => [id, leaderTms[id] ? String(leaderTms[id]) : ''])))
              }}
            >
              Copy {leader.name}'s TMs
            </button>
          )}
          {lifts.map((id) => {
            const tm = tmFor(id)
            return (
              <WeightInput
                key={id}
                label={findExercise(id)?.name ?? id}
                value={inputs[id] ?? ''}
                onChange={(value) => setInputs({ ...inputs, [id]: value })}
                hint={mode === 'oneRepMax' && tm !== undefined ? `TM ${tm}` : undefined}
              />
            )
          })}
          <p className="muted small">
            {mode === 'tm' ? 'Copy these straight from the nSuns app.' : 'Each TM is set at 90% of the 1RM.'} Anything left
            blank can be added later.
          </p>
        </section>
      )}

      <section className="card">
        <h2>Exercise ratings</h2>
        <ChoiceList
          label="Exercise ratings"
          value={ratingPreset}
          onChange={setRatingPreset}
          options={RATING_PRESETS.map((r) => ({ value: r.id, title: r.name, description: r.description }))}
        />
      </section>

      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-big" disabled={saving} onClick={() => void save()}>
        Create profile
      </button>
    </>
  )
}
