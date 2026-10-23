import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { backupDue } from '../../db/backup.ts'
import { db, getSetting } from '../../db/db.ts'
import { daysAgo } from '../format.ts'

export function Home() {
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray())
      .filter((p) => !p.archived)
      .sort((a, b) => a.createdAt - b.createdAt)
    return { profiles, lastBackupAt: await getSetting<number | null>('lastBackupAt', null) }
  }, [])
  if (!data) return null
  const { profiles, lastBackupAt } = data
  const now = Date.now()

  return (
    <>
      <h1>Wigwam531</h1>

      {backupDue(lastBackupAt, now, profiles.length > 0) && (
        <Link to="/settings" className="card card-warn">
          {lastBackupAt === null ? 'No backup yet.' : `Last backup ${daysAgo(lastBackupAt, now)}.`} Tap to save
          one.
        </Link>
      )}

      {profiles.length === 0 ? (
        <section className="card">
          <h2>Who trains here?</h2>
          <p className="muted">
            Add yourself first, then anyone who lifts with you. Partners can follow your program and keep their own
            numbers.
          </p>
          <Link to="/profiles/new" className="btn btn-big">
            Add a profile
          </Link>
        </section>
      ) : (
        <section className="card">
          <h2>Lifters</h2>
          <ul className="list">
            {profiles.map((p) => (
              <li key={p.id}>
                <Link to={`/profiles/${p.id}`} className="list-row">
                  <span className="dot" style={{ background: p.color }} />
                  <span className="grow">{p.name}</span>
                  <span className="chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted small">Starting a workout comes in the next update.</p>
        </section>
      )}
    </>
  )
}
