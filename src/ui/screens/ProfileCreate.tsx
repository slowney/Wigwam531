import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { PRESETS } from '../../data/presets.ts'
import { RATING_PRESETS, type RatingPresetId } from '../../data/ratingPresets.ts'
import { findScheme } from '../../data/schemes.ts'
import { db, type ProfileRow, type ProgramRow } from '../../db/db.ts'
import { createProfile, loadTms, type ProgramChoice } from '../../db/profiles.ts'
import { requiredTms } from '../../engine/program.ts'
import { tmFromOneRepMax } from '../../engine/weights.ts'
import {
  BackLink,
  ChoiceList,
  ColorPicker,
  PROFILE_COLORS,
  Segmented,
  TextInput,
  WeightInput,
  parseLb,
} from '../components/forms.tsx'

const PRESET_BLURBS: Record<string, string> = {
  'nsuns-4day': 'Bench, squat, OHP and deadlift days, each with its T2.',
  'nsuns-4day-row': 'The same four days, plus a heavy barbell row on Day 1.',
}

export function ProfileCreate() {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray())
      .filter((p) => !p.archived)
      .sort((a, b) => a.createdAt - b.createdAt)
    return { profiles, programs: await db.programs.toArray() }
  }, [])
  if (!data) return null
  return <CreateForm {...data} onCreated={(id) => navigate(`/profiles/${id}`, { replace: true })} />
}

function CreateForm(props: { profiles: ProfileRow[]; programs: ProgramRow[]; onCreated: (id: string) => void }) {
  const { profiles, programs } = props
  const leaders = profiles.filter((p) => {
    const row = programs.find((r) => r.profileId === p.id)
    return row && !row.followsProfileId
  })

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(
    () => PROFILE_COLORS.find((c) => !profiles.some((p) => p.color === c.value))?.value ?? PROFILE_COLORS[0].value,
  )
  // Partners usually follow; the first profile starts its own program.
  const [choice, setChoice] = useState(leaders[0] ? `follow:${leaders[0].id}` : 'preset:nsuns-4day-row')
  const [mode, setMode] = useState<'tm' | 'oneRepMax'>('tm')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [ratingPreset, setRatingPreset] = useState<RatingPresetId>(profiles.length === 0 ? 'dumbbell-first' : 'blank')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const program: ProgramChoice = choice.startsWith('follow:')
    ? { kind: 'follow', leaderId: choice.slice('follow:'.length) }
    : { kind: 'preset', presetId: choice.slice('preset:'.length) }
  const leaderId = program.kind === 'follow' ? program.leaderId : undefined
  const leader = profiles.find((p) => p.id === leaderId)
  const chosen =
    program.kind === 'preset'
      ? PRESETS.find((p) => p.id === program.presetId)
      : programs.find((r) => r.profileId === program.leaderId)?.program
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
      props.onCreated(await createProfile({ name, color, program, tms, ratingPreset }))
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
          options={[
            ...leaders.map((l) => ({
              value: `follow:${l.id}`,
              title: `Follow ${l.name}`,
              description: `Same days and lifts as ${l.name}, with your own TMs. You can still swap single lifts.`,
            })),
            ...PRESETS.map((p) => ({ value: `preset:${p.id}`, title: p.name, description: PRESET_BLURBS[p.id] })),
          ]}
        />
      </section>

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
