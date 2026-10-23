import { useEffect, useState } from 'react'
import { isPersisted } from '../../db/db'

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

export function Settings() {
  const [persisted, setPersisted] = useState<boolean | undefined | null>(null)
  useEffect(() => {
    void isPersisted().then(setPersisted)
  }, [])
  const standalone = isStandalone()

  return (
    <>
      <h1>Settings</h1>
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
