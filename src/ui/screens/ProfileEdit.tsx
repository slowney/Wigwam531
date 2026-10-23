import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { db, type ProfileRow } from '../../db/db.ts'
import { updateProfile } from '../../db/profiles.ts'
import { BackLink, ColorPicker, TextInput } from '../components/forms.tsx'

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
  const [error, setError] = useState<string>()
  const back = `/profiles/${profile.id}`

  async function save() {
    try {
      await updateProfile(profile.id, { name, color })
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
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-big" onClick={() => void save()}>
        Save
      </button>
    </>
  )
}
