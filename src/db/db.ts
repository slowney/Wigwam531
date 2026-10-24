import Dexie, { type EntityTable, type Table } from 'dexie'
import type { AccessoryPick, WeekType } from '../engine/plan.ts'
import type { Program, ProgramOverrides } from '../engine/program.ts'
import type { ProgressionTable } from '../engine/progression.ts'
import type { Exercise, Gym, Muscle, Restriction, Stars } from '../engine/types.ts'
import type { DayStatus } from '../engine/week.ts'

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
  /** Changes to the default weekly sets per muscle. */
  muscleTargets?: Partial<Record<Muscle, number>>
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

export interface RestrictionRow extends Restriction {
  profileId: string
  createdAt: number
}

/** One pass through a profile's program. Not a calendar week. */
export interface WeekRow {
  id: string
  profileId: string
  number: number
  type: WeekType
  startedAt: number
  /** Set by End Week, or when the next week starts. */
  endedAt?: number
  /**
   * When the last day was done or skipped. Cleared if a day is unskipped.
   * A week finished since the last backup is what prompts the next one.
   */
  completedAt?: number
  /** Days missing from the map are pending. */
  days: Record<string, DayStatus>
}

export interface SessionRow {
  id: string
  status: 'active' | 'done'
  startedAt: number
  endedAt?: number
  gymId: string
  /** Profile ids in tab order. */
  participants: string[]
  /** The tab on screen, saved so a reload lands on the same person. */
  activeProfileId: string
  /** Jump to the next lifter's tab after each logged set. */
  rotate: boolean
}

/** One person's part of a session. */
export interface EntryRow {
  id: string
  sessionId: string
  profileId: string
  weekId: string
  dayId: string
  /** Today-only swaps: main slot id → exercise id. */
  swaps: Record<string, string>
  accessories: AccessoryPick[]
  /** Their own rest countdown, saved so it survives the app being killed. */
  restEndsAt?: number
  restSeconds?: number
  /** Exercises folded or opened by hand, by slot id. Saved so a reload looks the same. */
  collapsed?: Record<string, boolean>
  notes?: string
  /** How the whole workout felt, asked for at the end. */
  rating?: Stars
  status: 'active' | 'done' | 'empty'
}

/**
 * A logged set. The prescription is copied in at logging time, so history
 * stays true however the program changes later.
 */
export interface SetRow {
  id: string
  profileId: string
  sessionId: string
  entryId: string
  weekId: string
  dayId: string
  /** Main slot id or accessory pick id. */
  slotId: string
  /** Set number within the slot, from 0. */
  index: number
  role: 'main' | 'accessory'
  exerciseId: string
  warmup: boolean
  prescribedWeight?: number
  prescribedReps: number
  prescribedRepsMax?: number
  pct?: number
  amrap: boolean
  progression: boolean
  tmTest: boolean
  tmExerciseId?: string
  tm?: number
  weight: number
  reps: number
  rpe?: number
  note?: string
  at: number
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
  weeks: EntityTable<WeekRow, 'id'>
  sessions: EntityTable<SessionRow, 'id'>
  entries: EntityTable<EntryRow, 'id'>
  sets: EntityTable<SetRow, 'id'>
  restrictions: EntityTable<RestrictionRow, 'id'>
}

/** The latest db.version() below. Backups carry it so old ones can be upgraded. */
export const SCHEMA_VERSION = 4

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
  db.version(3).stores({
    weeks: 'id, profileId, [profileId+number]',
    sessions: 'id, status',
    entries: 'id, sessionId, profileId, weekId',
    sets: 'id, entryId, sessionId, profileId, weekId, [profileId+exerciseId]',
  })
  db.version(4).stores({ restrictions: 'id, profileId' })
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
