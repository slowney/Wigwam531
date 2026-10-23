import { db as defaultDb, SCHEMA_VERSION, type WigwamDb } from './db.ts'

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

/** Nag once there's something worth losing and the last backup is a week old. */
export function backupDue(lastBackupAt: number | null, now: number, hasProfiles: boolean): boolean {
  if (!hasProfiles) return false
  return lastBackupAt === null || now - lastBackupAt > BACKUP_EVERY_DAYS * DAY
}

export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `wigwam531-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}
