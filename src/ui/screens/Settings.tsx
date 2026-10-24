import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { db, isPersisted } from '../../db/db.ts'
import { maxLoad } from '../../engine/weights.ts'
import { BackupSection } from '../BackupSection.tsx'

function isStandalone(): boolean {
  // navigator.standalone is the iOS-only flag; the media query covers the rest.
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function storageLabel(persisted: boolean | undefined | null): string {
  if (persisted === null) return 'Checking…'
  if (persisted === undefined) return 'Unknown'
  return persisted ? 'Persistent' : 'Best effort (iOS may clear it)'
}

const span = (weights: number[]) => (weights.length ? `${weights[0]}–${weights[weights.length - 1]} lb` : 'none')

function GymSection() {
  const gym = useLiveQuery(() => db.gyms.get('home'), [])
  if (!gym) return null
  const plates = gym.plates.map((p) => (p.pairs > 1 ? `${p.weight} ×${p.pairs}` : String(p.weight))).join(', ')
  return (
    <section className="card">
      <h2>{gym.name} gym</h2>
      <dl className="facts">
        <dt>Bars</dt>
        <dd>
          Barbell {gym.bars.barbell}, trap bar {gym.bars.trapBar ?? '–'}, EZ bar {gym.bars.ezBar ?? '–'}
        </dd>
        <dt>Plate pairs</dt>
        <dd>
          {plates} (barbell max {maxLoad(gym.bars.barbell, gym.plates)})
        </dd>
        <dt>Dumbbells</dt>
        <dd>{span(gym.dumbbells)}</dd>
        <dt>Kettlebell</dt>
        <dd>{span(gym.kettlebells)}</dd>
        <dt>Cable stack</dt>
        <dd>{gym.cableStep} lb steps</dd>
      </dl>
    </section>
  )
}

const LIBRARY = [
  { to: '/settings/exercises', label: 'Exercises' },
  { to: '/settings/schemes', label: 'Set schemes' },
  { to: '/settings/programs', label: 'My programs' },
]

function LibrarySection() {
  return (
    <section className="card">
      <h2>Library</h2>
      <ul className="list">
        {LIBRARY.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="list-row">
              <span className="grow">{l.label}</span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Settings() {
  const [persisted, setPersisted] = useState<boolean | undefined | null>(null)
  useEffect(() => {
    void isPersisted().then(setPersisted)
  }, [])
  const standalone = isStandalone()

  return (
    <>
      <h1>Settings</h1>
      <BackupSection />
      <LibrarySection />
      <GymSection />
      <section className="card">
        <h2>This device</h2>
        <dl className="facts">
          <dt>Installed</dt>
          <dd>{standalone ? 'Yes, from the home screen' : 'No, running in the browser'}</dd>
          <dt>Storage</dt>
          <dd>{storageLabel(persisted)}</dd>
          <dt>Version</dt>
          <dd>{new Date(__APP_BUILD__).toLocaleString()}</dd>
        </dl>
      </section>
      {!standalone && (
        <section className="card">
          <h2>Install on iPhone</h2>
          <ol className="steps">
            <li>Open this page in Safari.</li>
            <li>Tap Share, then Add to Home Screen.</li>
            <li>Open Wigwam531 from the home screen from now on.</li>
          </ol>
        </section>
      )}
    </>
  )
}
