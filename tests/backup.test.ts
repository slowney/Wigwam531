import { describe, expect, it } from 'vitest'
import { HOME_GYM } from '../src/data/gym.ts'
import {
  backupFileName,
  backupReminder,
  describeBackup,
  exportBackup,
  importBackup,
  loadBackupState,
  parseBackup,
  type BackupFile,
  type BackupState,
} from '../src/db/backup.ts'
import { SCHEMA_VERSION, getSetting, openDb, setSetting } from '../src/db/db.ts'
import { addBodyweight, archiveProfile, createProfile, setTm } from '../src/db/profiles.ts'
import { ensureSeeded } from '../src/db/seed.ts'

let dbCount = 0
const freshName = () => `backup-test-${dbCount++}`

async function seededDb(name: string) {
  const db = openDb(name)
  await ensureSeeded(db)
  const lead = await createProfile(
    {
      name: 'Lead',
      color: '#f2a33a',
      program: { kind: 'preset', presetId: 'nsuns-4day-row' },
      tms: { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 },
      ratingPreset: 'dumbbell-first',
    },
    db,
    1000,
  )
  const partner = await createProfile(
    {
      name: 'Partner',
      color: '#3cc1b0',
      program: { kind: 'follow', leaderId: lead },
      tms: { 'bench-press': 185 },
      ratingPreset: 'blank',
    },
    db,
    2000,
  )
  await createProfile(
    { name: 'Gone', color: '#9aa0a8', program: { kind: 'preset', presetId: 'nsuns-4day' }, tms: {}, ratingPreset: 'blank' },
    db,
    2500,
  )
  const gone = (await db.profiles.toArray()).find((p) => p.name === 'Gone')!
  await archiveProfile(gone.id, db)
  await setTm(partner, 'bench-press', 190, 'manual', db, 3000)
  await addBodyweight(lead, 180, db, 4000)
  await db.exercises.add({ ...CUSTOM_EXERCISE, createdAt: 5000 })
  await setSetting('lastBackupAt', 6000, db)
  return db
}

const CUSTOM_EXERCISE = {
  id: 'cable-y-raise',
  name: 'Cable Y-raise',
  equipment: ['cable' as const],
  pattern: 'isolation' as const,
  region: 'upper' as const,
  muscles: { sideDelts: 1 as const, upperBack: 0.5 as const },
  load: 'cable' as const,
  sets: 3,
  reps: [12, 15] as [number, number],
}

describe('backup round trip', () => {
  it('exports, wipes and re-imports to identical data', async () => {
    const name = freshName()
    const db = await seededDb(name)
    const before = await exportBackup(db, 7000)
    expect(Object.keys(before.tables).sort()).toEqual([
      'bodyweights',
      'entries',
      'exercises',
      'gyms',
      'profiles',
      'programs',
      'ratings',
      'sessions',
      'sets',
      'settings',
      'trainingMaxes',
      'weeks',
    ])

    // Through JSON text, the way the file actually travels.
    const text = JSON.stringify(before)
    await db.delete()
    const restored = openDb(name)
    expect(await restored.profiles.count()).toBe(0)

    await importBackup(parseBackup(text), restored)
    const after = await exportBackup(restored, 7000)
    expect(after).toEqual(before)
    expect(after.tables['profiles']).toHaveLength(3)
  })

  it('restores all or nothing', async () => {
    const db = await seededDb(freshName())
    const good = await exportBackup(db)
    const profiles = good.tables['profiles']!
    // Two rows with the same id: the import has to fail part-way through.
    const broken: BackupFile = { ...good, tables: { ...good.tables, profiles: [...profiles, profiles[0]] } }

    const target = await seededDb(freshName())
    await setSetting('marker', 'still here', target)
    await expect(importBackup(broken, target)).rejects.toThrow()
    expect(await getSetting('marker', null, target)).toBe('still here')
    expect(await target.profiles.count()).toBe(3)
  })
})

describe('reading a backup file', () => {
  it("rejects anything that isn't a Wigwam531 backup", () => {
    expect(() => parseBackup('not json')).toThrow("isn't a Wigwam531 backup")
    expect(() => parseBackup('{}')).toThrow("isn't a Wigwam531 backup")
    expect(() => parseBackup(JSON.stringify({ app: 'other', schemaVersion: 1, exportedAt: '', tables: {} }))).toThrow()
    expect(() =>
      parseBackup(JSON.stringify({ app: 'wigwam531', schemaVersion: 2, exportedAt: '', tables: { profiles: {} } })),
    ).toThrow()
  })

  it('refuses a backup from a newer version of the app', () => {
    const newer = { app: 'wigwam531', schemaVersion: SCHEMA_VERSION + 1, exportedAt: '', tables: {} }
    expect(() => parseBackup(JSON.stringify(newer))).toThrow('newer version')
  })

  it('still reads a version 1 backup', async () => {
    const v1 = { app: 'wigwam531', schemaVersion: 1, exportedAt: '2026-10-23T00:00:00Z', tables: { settings: [{ key: 'x', value: 1 }] } }
    const file = parseBackup(JSON.stringify(v1))
    expect(file.schemaVersion).toBe(SCHEMA_VERSION)
    const db = openDb(freshName())
    await importBackup(file, db)
    expect(await getSetting('x', null, db)).toBe(1)
    expect(await db.profiles.count()).toBe(0)
  })

  it('lists who is in it, leaving out archived profiles', async () => {
    const db = await seededDb(freshName())
    const summary = describeBackup(await exportBackup(db, Date.UTC(2026, 9, 23)))
    expect(summary.profiles).toEqual(['Lead', 'Partner'])
    expect(summary.exportedAt.toISOString()).toBe('2026-10-23T00:00:00.000Z')
  })
})

describe('backup reminder', () => {
  const day = 24 * 60 * 60 * 1000
  const state = (overrides: Partial<BackupState>): BackupState => ({
    lastBackupAt: 0,
    dismissedAt: null,
    lastWeekDoneAt: null,
    hasProfiles: true,
    ...overrides,
  })

  it('stays quiet until there is someone to lose', () => {
    expect(backupReminder(state({ hasProfiles: false, lastBackupAt: null }), 0)).toBeUndefined()
  })

  it('nags when there has never been a backup', () => {
    expect(backupReminder(state({ lastBackupAt: null }), 0)).toBe('never')
  })

  it('nags once the last backup is over a week old', () => {
    expect(backupReminder(state({}), 7 * day)).toBeUndefined()
    expect(backupReminder(state({}), 7 * day + 1)).toBe('stale')
  })

  it('prompts when a week finishes after the last backup', () => {
    expect(backupReminder(state({ lastBackupAt: 100, lastWeekDoneAt: 200 }), 300)).toBe('weekDone')
    expect(backupReminder(state({ lastBackupAt: 300, lastWeekDoneAt: 200 }), 400)).toBeUndefined()
  })

  it('takes "Not now" until the next week finishes', () => {
    const dismissed = state({ lastBackupAt: 100, lastWeekDoneAt: 200, dismissedAt: 250 })
    expect(backupReminder(dismissed, 300)).toBeUndefined()
    expect(backupReminder({ ...dismissed, lastWeekDoneAt: 400 }, 500)).toBe('weekDone')
  })

  it('reads the latest finished week from the database', async () => {
    const db = await seededDb(freshName())
    const lead = (await db.profiles.toArray()).find((p) => p.name === 'Lead')!
    await db.weeks.bulkAdd([
      { id: 'w1', profileId: lead.id, number: 1, type: 'normal', startedAt: 1, completedAt: 900, days: {} },
      { id: 'w2', profileId: lead.id, number: 2, type: 'normal', startedAt: 2, days: {} },
    ])
    expect(await loadBackupState(db)).toEqual({
      lastBackupAt: 6000,
      dismissedAt: null,
      lastWeekDoneAt: 900,
      hasProfiles: true,
    })
  })

  it('names files by local date', () => {
    expect(backupFileName(new Date(2026, 9, 3))).toBe('wigwam531-backup-2026-10-03.json')
  })
})

describe('the Home gym seed', () => {
  it('is created once, from the garage equipment', async () => {
    const db = openDb(freshName())
    await ensureSeeded(db)
    await ensureSeeded(db)
    expect(await db.gyms.toArray()).toEqual([HOME_GYM])
  })
})
