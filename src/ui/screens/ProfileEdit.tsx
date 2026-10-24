import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { db, type ProfileRow } from '../../db/db.ts'
import { updateProfile } from '../../db/profiles.ts'
import type { Sex } from '../../engine/metrics.ts'
import { BackLink, ColorPicker, Segmented, TextInput } from '../components/forms.tsx'

export function ProfileEdit() {
  const { id = '' } = useParams()
  // null, not undefined, for a missing profile: undefined means still loading.
  const profile = useLiveQuery(async () => (await db.profiles.get(id)) ?? null, [id])
  if (profile === undefined) return null
  if (profile === null) {
    return (
      <>
        <BackLink to="/profiles" label="Profiles" />
        <p className="muted">That profile doesn't exist.</p>
      </>
    )
  }
  // Keyed so the form's state starts from the stored profile.
  return <EditForm key={profile.id} profile={profile} />
}

function EditForm({ profile }: { profile: ProfileRow }) {
  const navigate = useNavigate()
  const [name, setName] = useState(profile.name)
  const [color, setColor] = useState(profile.color)
  const [sex, setSex] = useState<Sex | 'unset'>(profile.sex ?? 'unset')
  const [advanced, setAdvanced] = useState(profile.advanced ?? false)
  const [error, setError] = useState<string>()
  const back = `/profiles/${profile.id}`

  async function save() {
    try {
      await updateProfile(profile.id, { name, color, sex: sex === 'unset' ? null : sex, advanced })
      navigate(back, { replace: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <BackLink to={back} label={profile.name} />
      <h1>Edit profile</h1>
      <section className="card">
        <TextInput label="Name" value={name} onChange={setName} />
        <div className="field">
          <span className="label">Color</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </section>
      <section className="card">
        <h2>Advanced metrics</h2>
        <label className="toggle">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Show lift ÷
          bodyweight, the estimated total and DOTS on Progress
        </label>
        <div className="field section-label">
          <span className="label">Sex, for DOTS</span>
          <Segmented
            label="Sex"
            value={sex}
            onChange={setSex}
            options={[
              { value: 'unset', label: 'Not set' },
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
          />
        </div>
        <p className="muted small no-margin">DOTS also needs a logged bodyweight. Without both, it's left out.</p>
      </section>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-big" onClick={() => void save()}>
        Save
      </button>
    </>
  )
}
