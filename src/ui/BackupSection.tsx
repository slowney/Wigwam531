import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ChangeEvent } from 'react'
import {
  backupFileName,
  describeBackup,
  exportBackup,
  importBackup,
  parseBackup,
  type BackupFile,
} from '../db/backup.ts'
import { getSetting, setSetting } from '../db/db.ts'
import { ensureSeeded } from '../db/seed.ts'
import { formatDate } from './format.ts'

type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Must be called straight from a tap: Safari only opens the share sheet
 * with the tap's "user activation" still live, and any await before
 * navigator.share() would spend it.
 */
function saveFile(text: string, name: string): Promise<SaveResult> {
  // JSON first; plain text if this Safari won't share JSON files.
  for (const type of ['application/json', 'text/plain']) {
    const file = new File([text], name, { type })
    if (navigator.canShare?.({ files: [file] })) {
      return navigator.share({ files: [file] }).then(
        () => 'shared' as const,
        (e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled' as const
          throw e
        },
      )
    }
  }
  // Desktop browsers: a plain download.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return Promise.resolve('downloaded')
}

export function BackupSection() {
  const lastBackupAt = useLiveQuery(() => getSetting<number | null>('lastBackupAt', null), [])
  // Kept ready ahead of the tap, for the share-sheet reason above. It's a
  // live query, so it's always the current data.
  const prepared = useLiveQuery(() => exportBackup(), [])
  const [pending, setPending] = useState<BackupFile>()
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()
  const picker = useRef<HTMLInputElement>(null)

  function save() {
    if (!prepared) return
    const now = new Date()
    const text = JSON.stringify({ ...prepared, exportedAt: now.toISOString() })
    saveFile(text, backupFileName(now)).then(
      async (result) => {
        if (result === 'cancelled') return
        await setSetting('lastBackupAt', now.getTime())
        setMessage({ text: result === 'shared' ? 'Backup saved.' : 'Backup downloaded.' })
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
        <button type="button" className="btn" disabled={!prepared} onClick={save}>
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
