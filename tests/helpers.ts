// Shared test setup: fake profiles and a driver that runs a whole workout
// through the same code the session screen uses. Numbers are made up; the
// repo is public.
import { findExercise } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { findScheme } from '../src/data/schemes.ts'
import { openDb, type WigwamDb } from '../src/db/db.ts'
import { createProfile, loadProgram, loadTms } from '../src/db/profiles.ts'
import { addAccessory, finishSession, logSet, setFromPlan, startSession } from '../src/db/sessions.ts'
import { waveIndex, type PlannedSet, type PlannedSlot } from '../src/engine/plan.ts'
import { planEntry } from '../src/engine/session.ts'

export const freshDb = (): WigwamDb => openDb(`test-${crypto.randomUUID()}`)

export type Tms = Record<string, number>

export const lifts = (bench: number, squat: number, ohp: number, deadlift: number): Tms => ({
  'bench-press': bench,
  squat,
  'overhead-press': ohp,
  deadlift,
})

export async function addLeader(db: WigwamDb, name: string, tms: Tms, now = 1): Promise<string> {
  return createProfile(
    { name, color: '#f2a33a', program: { kind: 'preset', presetId: 'nsuns-4day-row' }, tms, ratingPreset: 'blank' },
    db,
    now,
  )
}

export async function addFollower(db: WigwamDb, name: string, leaderId: string, tms: Tms, now = 2): Promise<string> {
  return createProfile(
    { name, color: '#3cc1b0', program: { kind: 'follow', leaderId }, tms, ratingPreset: 'blank' },
    db,
    now,
  )
}

export interface Lifter {
  profileId: string
  dayId: string
  /** Reps on the 1+ set. */
  star?: number
  /** Weight for rep-range work with nothing carried over yet. */
  startWeight?: number
  /** Added before logging; shared with this lifter's followers in the session. */
  accessories?: string[]
}

/**
 * Runs one session: every planned working set logged at its prescribed
 * weight, top of the range for rep-range work, `star` reps on the 1+ set.
 */
export async function doWorkout(db: WigwamDb, lifters: Lifter[], now: number): Promise<string> {
  const sessionId = await startSession(
    lifters.map((l) => ({ profileId: l.profileId, dayId: l.dayId })),
    'home',
    db,
    now,
  )
  let clock = now
  for (const lifter of lifters) {
    const entryId = (await db.entries.where('sessionId').equals(sessionId).toArray()).find(
      (e) => e.profileId === lifter.profileId,
    )!.id
    for (const exerciseId of lifter.accessories ?? []) {
      await addAccessory(entryId, exerciseId, { forFollowers: true }, db)
    }
  }
  for (const lifter of lifters) {
    const entry = (await db.entries.where('sessionId').equals(sessionId).toArray()).find(
      (e) => e.profileId === lifter.profileId,
    )!
    const plan = await planFor(db, entry.profileId, entry.id)
    for (const slot of plan.slots) {
      for (const [index, set] of slot.sets.entries()) {
        const reps = set.progression && lifter.star !== undefined ? lifter.star : (set.repsMax ?? set.reps)
        const weight = set.weight ?? lifter.startWeight ?? 45
        await logSet(setFromPlan(entry, slot, index, set, { weight, reps }), undefined, db, ++clock)
      }
    }
  }
  await finishSession(sessionId, db, ++clock)
  return sessionId
}

export async function planFor(
  db: WigwamDb,
  profileId: string,
  entryId: string,
): Promise<{ slots: PlannedSlot[]; sets: PlannedSet[] }> {
  const entry = (await db.entries.get(entryId))!
  const plan = planEntry({
    program: (await loadProgram(profileId, db))!,
    dayId: entry.dayId,
    swaps: entry.swaps,
    accessories: entry.accessories,
    skips: entry.skips,
    weekType: (await db.weeks.get(entry.weekId))!.type,
    waveIndex: waveIndex(
      await db.weeks.where('profileId').equals(profileId).toArray(),
      (await db.weeks.get(entry.weekId))!.number,
    ),
    tms: await loadTms(profileId, db),
    history: await db.sets.where('profileId').equals(profileId).toArray(),
    sessionId: entry.sessionId,
    gym: HOME_GYM,
    lookup: findExercise,
    schemes: findScheme,
  })!
  return { slots: plan.slots, sets: plan.slots.flatMap((s) => s.sets) }
}
