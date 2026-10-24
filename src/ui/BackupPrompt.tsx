import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { backupReminder, loadBackupState, type BackupReason } from '../db/backup.ts'
import { setSetting } from '../db/db.ts'
import { useBackupSaver } from './backupFile.ts'

const MESSAGE: Record<BackupReason, string> = {
  weekDone: 'A week just finished. Save a backup to Files or iCloud Drive?',
  never: 'No backup yet, and everything lives only on this phone.',
  stale: 'The last backup is more than a week old.',
}

function BackupPrompt({ reason }: { reason: BackupReason }) {
  const saver = useBackupSaver()
  const [error, setError] = useState<string>()
  return (
    <section className="card card-warn">
      <p className="no-margin">{MESSAGE[reason]}</p>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={!saver.ready}
          onClick={() => saver.save().catch((e: unknown) => setError(`Couldn't save the backup: ${(e as Error).message}`))}
        >
          Save a backup
        </button>
        {reason === 'weekDone' && (
          <button type="button" className="btn btn-quiet" onClick={() => void setSetting('backupDismissedAt', Date.now())}>
            Not now
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

/** Shows a backup prompt when one is due. `only` limits it to one reason. */
export function BackupReminder({ only }: { only?: BackupReason }) {
  const state = useLiveQuery(() => loadBackupState(), [])
  if (!state) return null
  const reason = backupReminder(state, Date.now())
  if (!reason || (only && reason !== only)) return null
  return <BackupPrompt reason={reason} />
}
