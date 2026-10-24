import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router'
import { DEFAULT_TARGETS } from '../../data/targets.ts'
import { db } from '../../db/db.ts'
import { loadTargets, resetMuscleTargets, setMuscleTarget } from '../../db/profiles.ts'
import { MUSCLE_LABELS, MUSCLES } from '../../engine/types.ts'
import { BackLink, ConfirmButton } from '../components/forms.tsx'

export function ProfileTargets() {
  const { id = '' } = useParams()
  const data = useLiveQuery(async () => ({ profile: await db.profiles.get(id), targets: await loadTargets(id) }), [id])
  if (!data) return null
  const { profile, targets } = data
  if (!profile) return <p className="muted">That profile doesn't exist.</p>
  const changed = MUSCLES.some((m) => targets[m] !== DEFAULT_TARGETS[m])
  const now = Date.now()
  const active = (profile.focuses ?? []).filter((f) => f.until === undefined || f.until > now)

  return (
    <>
      <BackLink to={`/profiles/${id}`} label={profile.name} />
      <h1>Muscle targets</h1>
      <p className="muted">
        Weekly sets per muscle. Main lifts count too: a set counts in full for the muscles it mainly works and as half
        for the ones it helps. Anything under target shows up as "behind" when picking accessories.
      </p>
      {active.length > 0 && (
        <p className="small">
          On top of these, {active.map((f) => `${f.name} focus (+${f.extraSets} accessory sets a week each)`).join(' and ')}{' '}
          comes first. Change it on the profile.
        </p>
      )}
      <section className="card">
        {MUSCLES.map((m) => (
          <div key={m} className="tm-line">
            <div className="grow stack">
              <strong>{MUSCLE_LABELS[m]}</strong>
              {targets[m] !== DEFAULT_TARGETS[m] && <span className="muted small">Default {DEFAULT_TARGETS[m]}</span>}
            </div>
            <div className="tm-stepper">
              <button
                type="button"
                className="btn btn-quiet step"
                aria-label={`Fewer ${MUSCLE_LABELS[m]} sets`}
                onClick={() => void setMuscleTarget(id, m, targets[m] - 1)}
              >
                −
              </button>
              <output className="tm-value">{targets[m]}</output>
              <button
                type="button"
                className="btn btn-quiet step"
                aria-label={`More ${MUSCLE_LABELS[m]} sets`}
                onClick={() => void setMuscleTarget(id, m, targets[m] + 1)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </section>
      {changed && (
        <ConfirmButton
          label="Reset to defaults"
          confirmLabel="Tap again to reset"
          onConfirm={() => void resetMuscleTargets(id)}
        />
      )}
    </>
  )
}
