import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Program, ProgramOverrides } from '../engine/program.ts'
import type { ProgressionTable } from '../engine/progression.ts'
import type { Exercise, Gym, Stars } from '../engine/types.ts'

// The only module that touches IndexedDB. The engine never imports this;
// screens read through it and hand plain objects to the engine.

export interface Setting {
  key: string
  value: unknown
}

export interface ProfileRow {
  id: string
  name: string
  color: string
  createdAt: number
  /** Archived rather than deleted, so nothing logged against them is lost. */
  archived: boolean
  /** Per-lift changes to the default progression table, by TM exercise id. */
  progressionTables?: Record<string, ProgressionTable>
}

export interface ProgramRow {
  profileId: string
  /** Set while this profile follows someone else's program. */
  followsProfileId?: string
  /** Their own program. Absent while following. */
  program?: Program
  /** A follower's per-slot changes to the leader's program. */
  overrides?: ProgramOverrides
  updatedAt: number
}

export type TmChangeReason = 'start' | 'progression' | 'manual' | 'reset' | 'tmTest'

/** TM history. The latest row per lift is the current TM. */
export interface TrainingMaxRow {
  id: string
  profileId: string
  exerciseId: string
  lb: number
  at: number
  reason: TmChangeReason
}

export interface BodyweightRow {
  id: string
  profileId: string
  lb: number
  at: number
}

export interface RatingRow {
  profileId: string
  exerciseId: string
  stars?: Stars
  hidden: boolean
}

/** Exercises added in the app. Built-ins ship in code, so fixes to them reach everyone. */
export interface CustomExerciseRow extends Exercise {
  createdAt: number
}

export type WigwamDb = Dexie & {
  settings: EntityTable<Setting, 'key'>
  profiles: EntityTable<ProfileRow, 'id'>
  programs: EntityTable<ProgramRow, 'profileId'>
  trainingMaxes: EntityTable<TrainingMaxRow, 'id'>
  bodyweights: EntityTable<BodyweightRow, 'id'>
  gyms: EntityTable<Gym, 'id'>
  exercises: EntityTable<CustomExerciseRow, 'id'>
  ratings: Table<RatingRow, [string, string]>
}

/** The latest db.version() below. Backups carry it so old ones can be upgraded. */
export const SCHEMA_VERSION = 2

export function openDb(name = 'wigwam531'): WigwamDb {
  const db = new Dexie(name) as WigwamDb
  // Versions only ever add tables or indexes. Never edit a version that has
  // shipped; add a new one below it.
  db.version(1).stores({ settings: 'key' })
  db.version(2)
    .stores({
      profiles: 'id',
      programs: 'profileId, followsProfileId',
      trainingMaxes: 'id, profileId, [profileId+exerciseId]',
      bodyweights: 'id, profileId',
      gyms: 'id',
      exercises: 'id',
      ratings: '[profileId+exerciseId], profileId',
    })
    // Phase 0's tap counter has done its job.
    .upgrade((tx) => tx.table('settings').delete('phase0.counter'))
  return db
}

export const db = openDb()

/** String ids, so rows stay unique if two phones' data ever meet. */
export function newId(): string {
  return crypto.randomUUID()
}

export async function getSetting<T>(key: string, fallback: T, from: WigwamDb = db): Promise<T> {
  const row = await from.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown, to: WigwamDb = db): Promise<void> {
  await to.settings.put({ key, value })
}

// iOS can evict storage for sites it thinks are unused. A home-screen app
// is usually granted persistence; this asks, and reports what it got.
export async function requestPersistence(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function isPersisted(): Promise<boolean | undefined> {
  if (!navigator.storage?.persisted) return undefined
  return navigator.storage.persisted()
}
