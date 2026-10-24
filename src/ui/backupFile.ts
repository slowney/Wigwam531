import { useLiveQuery } from 'dexie-react-hooks'
import { backupFileName, exportBackup } from '../db/backup.ts'
import { setSetting } from '../db/db.ts'

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

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

/**
 * Keeps a backup ready ahead of the tap, for the share-sheet reason above.
 * It's a live query, so it's always the current data. `save` records the
 * backup time unless the share sheet was cancelled.
 */
export function useBackupSaver(): { ready: boolean; save: () => Promise<SaveResult> } {
  const prepared = useLiveQuery(() => exportBackup(), [])
  return {
    ready: prepared !== undefined,
    save: () => {
      if (!prepared) return Promise.resolve('cancelled')
      const now = new Date()
      const text = JSON.stringify({ ...prepared, exportedAt: now.toISOString() })
      return saveFile(text, backupFileName(now)).then(async (result) => {
        if (result !== 'cancelled') await setSetting('lastBackupAt', now.getTime())
        return result
      })
    },
  }
}
