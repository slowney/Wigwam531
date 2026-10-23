import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db, type ProfileRow, type ProgramRow } from '../../db/db.ts'
import { restoreProfile } from '../../db/profiles.ts'

export function programLabel(profileId: string, programs: ProgramRow[], profiles: ProfileRow[]): string {
  const row = programs.find((r) => r.profileId === profileId)
  if (!row) return ''
  if (row.followsProfileId) {
    return `Follows ${profiles.find((p) => p.id === row.followsProfileId)?.name ?? 'someone'}`
  }
  return row.program?.name ?? ''
}

export function Profiles() {
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray()).sort((a, b) => a.createdAt - b.createdAt)
    return { profiles, programs: await db.programs.toArray() }
  }, [])
  if (!data) return null
  const { profiles, programs } = data
  const active = profiles.filter((p) => !p.archived)
  const archived = profiles.filter((p) => p.archived)

  return (
    <>
      <h1>Profiles</h1>
      {active.length === 0 ? (
        <p className="muted">Nobody yet. Add yourself first, then anyone who trains with you.</p>
      ) : (
        <ul className="list card">
          {active.map((p) => (
            <li key={p.id}>
              <Link to={`/profiles/${p.id}`} className="list-row">
                <span className="dot" style={{ background: p.color }} />
                <span className="grow stack">
                  <strong>{p.name}</strong>
                  <span className="muted small">{programLabel(p.id, programs, profiles)}</span>
                </span>
                <span className="chev">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/profiles/new" className="btn btn-big">
        Add a profile
      </Link>

      {archived.length > 0 && (
        <details className="card archived">
          <summary>Archived ({archived.length})</summary>
          <ul className="list">
            {archived.map((p) => (
              <li key={p.id} className="row">
                <span className="dot" style={{ background: p.color }} />
                <span className="grow">{p.name}</span>
                <button type="button" className="btn btn-quiet btn-small" onClick={() => void restoreProfile(p.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
