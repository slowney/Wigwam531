import { EXERCISES } from '../data/exercises.ts'
import { PRESETS } from '../data/presets.ts'
import { presetRatings, type RatingPresetId } from '../data/ratingPresets.ts'
import { DEFAULT_TARGETS, targetsFor } from '../data/targets.ts'
import type { Focus, Muscle, MuscleTargets } from '../engine/types.ts'
import { resolveProgram, type Program } from '../engine/program.ts'
import { currentTms } from '../engine/tms.ts'
import {
  db as defaultDb,
  newId,
  type BodyweightRow,
  type ProgramRow,
  type TmChangeReason,
  type WigwamDb,
} from './db.ts'

export type ProgramChoice = { kind: 'preset'; presetId: string } | { kind: 'follow'; leaderId: string }

export interface NewProfile {
  name: string
  color: string
  program: ProgramChoice
  /** Starting TMs by exercise id, already converted from 1RMs where needed. */
  tms: Record<string, number>
  ratingPreset: RatingPresetId
}

const validLb = (lb: number) => Number.isFinite(lb) && lb > 0

export async function createProfile(input: NewProfile, db: WigwamDb = defaultDb, now = Date.now()): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('A profile needs a name.')
  const id = newId()

  await db.transaction('rw', [db.profiles, db.programs, db.trainingMaxes, db.ratings], async () => {
    let program: ProgramRow
    if (input.program.kind === 'preset') {
      const { presetId } = input.program
      const preset = PRESETS.find((p) => p.id === presetId)
      if (!preset) throw new Error(`Unknown program "${presetId}".`)
      // A copy, so editing this profile's program never touches the preset.
      program = { profileId: id, program: structuredClone(preset), updatedAt: now }
    } else {
      const leader = await db.programs.get(input.program.leaderId)
      if (!leader) throw new Error("That profile doesn't have a program to follow.")
      // One level only: a chain would make a leader's edit ripple
      // unpredictably, and nobody needs it for a garage of three.
      if (leader.followsProfileId) throw new Error('Follow the leader directly, not one of their followers.')
      program = { profileId: id, followsProfileId: input.program.leaderId, overrides: { slots: {} }, updatedAt: now }
    }

    await db.profiles.add({ id, name, color: input.color, createdAt: now, archived: false })
    await db.programs.add(program)
    await db.trainingMaxes.bulkAdd(
      Object.entries(input.tms)
        .filter(([, lb]) => validLb(lb))
        .map(([exerciseId, lb]) => ({ id: newId(), profileId: id, exerciseId, lb, at: now, reason: 'start' as const })),
    )
    await db.ratings.bulkAdd(presetRatings(input.ratingPreset, EXERCISES).map((r) => ({ ...r, profileId: id })))
  })
  return id
}

export async function updateProfile(
  id: string,
  changes: { name?: string; color?: string },
  db: WigwamDb = defaultDb,
): Promise<void> {
  const name = changes.name?.trim()
  if (changes.name !== undefined && !name) throw new Error('A profile needs a name.')
  await db.profiles.update(id, { ...(name ? { name } : {}), ...(changes.color ? { color: changes.color } : {}) })
}

/** The program this profile actually runs: their own, or their leader's plus overrides. */
export async function loadProgram(profileId: string, db: WigwamDb = defaultDb): Promise<Program | undefined> {
  const row = await db.programs.get(profileId)
  if (!row) return undefined
  if (!row.followsProfileId) return row.program
  const leader = await db.programs.get(row.followsProfileId)
  return leader?.program ? resolveProgram(leader.program, row.overrides) : undefined
}

/**
 * Turns a follower's program into their own copy of what they were running,
 * overrides included. Used when a leader is archived, and later for unfollow.
 */
export async function detachFollower(profileId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    const program = await loadProgram(profileId, db)
    const row = await db.programs.get(profileId)
    if (!row?.followsProfileId || !program) return
    await db.programs.put({ profileId, program: structuredClone(program), updatedAt: now })
  })
}

export async function archiveProfile(id: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', [db.profiles, db.programs], async () => {
    const followers = await db.programs.where('followsProfileId').equals(id).toArray()
    for (const f of followers) await detachFollower(f.profileId, db, now)
    await db.profiles.update(id, { archived: true })
  })
}

export async function restoreProfile(id: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.profiles.update(id, { archived: false })
}

export async function loadTargets(profileId: string, db: WigwamDb = defaultDb): Promise<MuscleTargets> {
  return targetsFor((await db.profiles.get(profileId))?.muscleTargets)
}

/** In half sets, never below zero. A target set back to its default stops being a change. */
export async function setMuscleTarget(
  profileId: string,
  muscle: Muscle,
  sets: number,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    const profile = await db.profiles.get(profileId)
    if (!profile) return
    const changes = { ...profile.muscleTargets, [muscle]: Math.max(0, Math.round(sets * 2) / 2) }
    if (changes[muscle] === DEFAULT_TARGETS[muscle]) delete changes[muscle]
    await db.profiles.update(profileId, { muscleTargets: changes })
  })
}

export async function resetMuscleTargets(profileId: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.profiles.update(profileId, { muscleTargets: undefined })
}

export async function loadFocuses(profileId: string, db: WigwamDb = defaultDb): Promise<Focus[]> {
  return (await db.profiles.get(profileId))?.focuses ?? []
}

export async function addFocus(
  profileId: string,
  focus: Omit<Focus, 'id'>,
  db: WigwamDb = defaultDb,
): Promise<string> {
  if (focus.muscles.length === 0) throw new Error('Pick at least one muscle.')
  const id = newId()
  await db.transaction('rw', db.profiles, async () => {
    const profile = await db.profiles.get(profileId)
    if (profile) await db.profiles.update(profileId, { focuses: [...(profile.focuses ?? []), { ...focus, id }] })
  })
  return id
}

export async function removeFocus(profileId: string, focusId: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    const profile = await db.profiles.get(profileId)
    if (profile) await db.profiles.update(profileId, { focuses: (profile.focuses ?? []).filter((f) => f.id !== focusId) })
  })
}

export async function loadTms(profileId: string, db: WigwamDb = defaultDb): Promise<Record<string, number>> {
  return currentTms(await db.trainingMaxes.where('profileId').equals(profileId).toArray())
}

export async function setTm(
  profileId: string,
  exerciseId: string,
  lb: number,
  reason: TmChangeReason = 'manual',
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  if (!validLb(lb)) throw new Error('A TM has to be a positive number of pounds.')
  await db.trainingMaxes.add({ id: newId(), profileId, exerciseId, lb, at: now, reason })
}

export async function addBodyweight(
  profileId: string,
  lb: number,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  if (!validLb(lb)) throw new Error('Bodyweight has to be a positive number of pounds.')
  await db.bodyweights.add({ id: newId(), profileId, lb, at: now })
}

export async function deleteBodyweight(id: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.bodyweights.delete(id)
}

/** Newest first. */
export async function loadBodyweights(profileId: string, db: WigwamDb = defaultDb): Promise<BodyweightRow[]> {
  return db.bodyweights.where('profileId').equals(profileId).reverse().sortBy('at')
}
