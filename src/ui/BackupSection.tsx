import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ChangeEvent } from 'react'
import { describeBackup, importBackup, parseBackup, type BackupFile } from '../db/backup.ts'
import { getSetting, setSetting } from '../db/db.ts'
import { ensureSeeded } from '../db/seed.ts'
import { useBackupSaver } from './backupFile.ts'
import { formatDate } from './format.ts'

export function BackupSection() {
  const lastBackupAt = useLiveQuery(() => getSetting<number | null>('lastBackupAt', null), [])
  const saver = useBackupSaver()
  const [pending, setPending] = useState<BackupFile>()
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()
  const picker = useRef<HTMLInputElement>(null)

  function save() {
    saver.save().then(
      (result) => {
        if (result !== 'cancelled') setMessage({ text: result === 'shared' ? 'Backup saved.' : 'Backup downloaded.' })
      },
      (e: unknown) => setMessage({ text: `Couldn't save the backup: ${(e as Error).message}`, error: true }),
    )
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    e.target.value = ''
    if (!file) return
    try {
      setPending(parseBackup(await file.text()))
      setMessage(undefined)
    } catch (err) {
      setMessage({ text: (err as Error).message, error: true })
    }
  }

  async function restore(file: BackupFile) {
    setPending(undefined)
    try {
      await importBackup(file)
      await ensureSeeded()
      await setSetting('lastBackupAt', Date.parse(file.exportedAt))
      setMessage({ text: `Restored the backup from ${formatDate(Date.parse(file.exportedAt))}.` })
    } catch (err) {
      setMessage({ text: `Nothing was changed. ${(err as Error).message}`, error: true })
    }
  }

  const summary = pending ? describeBackup(pending) : undefined

  return (
    <section className="card">
      <h2>Backup</h2>
      <p className="no-margin">
        Last backup:{' '}
        {lastBackupAt === undefined ? '…' : lastBackupAt === null ? 'never' : formatDate(lastBackupAt)}
      </p>
      <p className="muted small">
        Everything lives on this phone only, and deleting the app from the home screen deletes it too. Save a
        backup to Files or iCloud Drive every week or so.
      </p>
      <div className="actions">
        <button type="button" className="btn" disabled={!saver.ready} onClick={save}>
          Save a backup
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => picker.current?.click()}>
          Restore…
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        accept=".json,application/json,text/plain"
        hidden
        onChange={(e) => void pick(e)}
      />

      {pending && summary && (
        <div className="confirm">
          <p className="no-margin">
            <strong>Replace everything on this phone</strong> with the backup from{' '}
            {formatDate(summary.exportedAt.getTime())}?
          </p>
          <p className="muted small">
            It has {summary.profiles.length ? summary.profiles.join(', ') : 'no profiles'}. Anything logged since then
            will be gone.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-danger" onClick={() => void restore(pending)}>
              Replace everything
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setPending(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p className={message.error ? 'error' : 'ok'}>{message.text}</p>}
    </section>
  )
}
