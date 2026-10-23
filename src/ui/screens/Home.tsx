import { useLiveQuery } from 'dexie-react-hooks'
import { bumpCounter, db, getSetting } from '../../db/db.ts'

// Phase 0 only: proves IndexedDB survives the app being closed on the
// phone. Goes away when real profiles land in Phase 2.
const COUNTER = 'phase0.counter'

export function Home() {
  const count = useLiveQuery(() => getSetting(COUNTER, 0, db), [], 0)

  return (
    <>
      <h1>Wigwam531</h1>
      <section className="card">
        <h2>Persistence check</h2>
        <p className="muted">
          Tap a few times, close the app completely (swipe it away), then reopen it from the home
          screen. The number should still be there.
        </p>
        <button className="btn btn-big" onClick={() => void bumpCounter(COUNTER)}>
          Tapped {count} {count === 1 ? 'time' : 'times'}
        </button>
      </section>
    </>
  )
}
