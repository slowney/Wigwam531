import { db as defaultDb, getSetting, SCHEMA_VERSION, type WigwamDb } from './db.ts'

// A backup is every table, verbatim. Restoring replaces everything on the
// phone, all or nothing: there is no merge, so there's nothing to get wrong.

export const BACKUP_APP = 'wigwam531'

export interface BackupFile {
  app: typeof BACKUP_APP
  schemaVersion: number
  exportedAt: string
  tables: Record<string, unknown[]>
}

export async function exportBackup(db: WigwamDb = defaultDb, now = Date.now()): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  await db.transaction('r', db.tables, async () => {
    for (const table of db.tables) tables[table.name] = await table.toArray()
  })
  return { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date(now).toISOString(), tables }
}

function isBackup(x: unknown): x is BackupFile {
  if (typeof x !== 'object' || x === null) return false
  const f = x as Partial<BackupFile>
  return (
    f.app === BACKUP_APP &&
    typeof f.schemaVersion === 'number' &&
    typeof f.exportedAt === 'string' &&
    typeof f.tables === 'object' &&
    f.tables !== null &&
    Object.values(f.tables).every(Array.isArray)
  )
}

/** Throws an error worth showing to the person holding the phone. */
export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't a Wigwam531 backup.")
  }
  if (!isBackup(data)) throw new Error("That file isn't a Wigwam531 backup.")
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('That backup came from a newer version of the app. Close and reopen the app to update it, then try again.')
  }
  return upgradeBackup(data)
}

/** Older backups are brought up to date here, one schema version at a time. */
function upgradeBackup(file: BackupFile): BackupFile {
  // Versions 2 and 3 only added tables, so older files restore as they are
  // and the new tables start empty.
  return { ...file, schemaVersion: SCHEMA_VERSION }
}

export async function importBackup(file: BackupFile, db: WigwamDb = defaultDb): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear()
      const rows = file.tables[table.name]
      if (rows?.length) await table.bulkAdd(rows)
    }
  })
}

export function describeBackup(file: BackupFile): { exportedAt: Date; profiles: string[] } {
  const profiles = (file.tables['profiles'] ?? []) as Array<{ name?: unknown; archived?: unknown; createdAt?: unknown }>
  return {
    exportedAt: new Date(file.exportedAt),
    // Rows come back in id order, and ids are random; creation order reads better.
    profiles: profiles
      .filter((p) => !p.archived && typeof p.name === 'string')
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
      .map((p) => p.name as string),
  }
}

const DAY = 24 * 60 * 60 * 1000
export const BACKUP_EVERY_DAYS = 7

export type BackupReason = 'weekDone' | 'never' | 'stale'

export interface BackupState {
  lastBackupAt: number | null
  /** "Not now" on a week-finished prompt. */
  dismissedAt: number | null
  /** The most recent week anyone finished. */
  lastWeekDoneAt: number | null
  hasProfiles: boolean
}

/**
 * Why a backup should be offered right now, if at all. A week finished since
 * the last backup comes first, and "Not now" holds that prompt until the next
 * week finishes. "Never backed up" and "over a week old" stay until a backup
 * is saved.
 */
export function backupReminder(state: BackupState, now: number): BackupReason | undefined {
  if (!state.hasProfiles) return undefined
  const handled = Math.max(state.lastBackupAt ?? 0, state.dismissedAt ?? 0)
  if (state.lastWeekDoneAt !== null && state.lastWeekDoneAt > handled) return 'weekDone'
  if (state.lastBackupAt === null) return 'never'
  if (now - state.lastBackupAt > BACKUP_EVERY_DAYS * DAY) return 'stale'
  return undefined
}

export async function loadBackupState(db: WigwamDb = defaultDb): Promise<BackupState> {
  const profiles = (await db.profiles.toArray()).filter((p) => !p.archived)
  const finished = (await db.weeks.toArray()).flatMap((w) => (w.completedAt === undefined ? [] : [w.completedAt]))
  return {
    lastBackupAt: await getSetting<number | null>('lastBackupAt', null, db),
    dismissedAt: await getSetting<number | null>('backupDismissedAt', null, db),
    lastWeekDoneAt: finished.length ? Math.max(...finished) : null,
    hasProfiles: profiles.length > 0,
  }
}

export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `wigwam531-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}
