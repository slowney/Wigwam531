import { findExercise } from '../data/exercises.ts'
import { resolveProgram, slotTmId, type MainSlot, type Program, type ProgramOverrides } from '../engine/program.ts'
import {
  clearOverride,
  cloneProgram,
  permanentSwap,
  setOverride,
  updateMainSlot,
  type SlotFields,
} from '../engine/programEdit.ts'
import type { ProgressionTable } from '../engine/progression.ts'
import { db as defaultDb, newId, type ProgramRow, type TemplateRow, type WigwamDb } from './db.ts'
import { detachFollower, loadProgram, loadTms } from './profiles.ts'
import { activeSession } from './sessions.ts'

/** Each affected person's program before and after an edit, by profile id. */
type Change = Map<string, { before?: Program; after?: Program }>

/**
 * Today's workout has to keep making sense through a program edit. Refuses
 * one that takes away the day someone is partway through, or that drops or
 * changes a lift they've already logged sets on. A lift swapped for today
 * only has to still be there.
 */
async function guardToday(change: Change, db: WigwamDb): Promise<void> {
  const session = await activeSession(db)
  if (!session) return
  for (const entry of await db.entries.where('sessionId').equals(session.id).toArray()) {
    const programs = change.get(entry.profileId)
    if (!programs) continue
    const name = (await db.profiles.get(entry.profileId))?.name ?? 'Someone'
    const after = programs.after?.days.find((d) => d.id === entry.dayId)
    if (!after) throw new Error(`${name} is partway through that day. Change it after the workout.`)
    const before = programs.before?.days.find((d) => d.id === entry.dayId)
    const logged = await db.sets
      .where('entryId')
      .equals(entry.id)
      .filter((s) => !s.warmup && s.role === 'main')
      .toArray()
    for (const slotId of new Set(logged.map((s) => s.slotId))) {
      const was = before?.mains.find((m) => m.id === slotId)
      const now = after.mains.find((m) => m.id === slotId)
      const same =
        was !== undefined &&
        now !== undefined &&
        (entry.swaps[slotId] !== undefined ||
          (was.exerciseId === now.exerciseId && was.schemeId === now.schemeId && slotTmId(was) === slotTmId(now)))
      if (!same) throw new Error(`${name} has already logged sets for that lift today. Change it after the workout.`)
    }
  }
}

/** A whole new program for these people (a switch, or a follow): none of them can be in today's workout. */
async function guardNotTraining(profileIds: string[], db: WigwamDb): Promise<void> {
  const session = await activeSession(db)
  if (!session) return
  const entry = (await db.entries.where('sessionId').equals(session.id).toArray()).find((e) =>
    profileIds.includes(e.profileId),
  )
  if (!entry) return
  const name = (await db.profiles.get(entry.profileId))?.name ?? 'Someone'
  throw new Error(`${name} is in today's workout. Switch after it's finished.`)
}

async function followersOf(leaderId: string, db: WigwamDb): Promise<ProgramRow[]> {
  return db.programs.where('followsProfileId').equals(leaderId).toArray()
}

/**
 * Saves a leader's program, checking today's workout for everyone it
 * reaches. Followers' changes to lifts that no longer exist are dropped:
 * they'd never show again, and would keep a scheme looking "in use".
 */
async function putOwnProgram(row: ProgramRow, program: Program, db: WigwamDb, now: number): Promise<void> {
  const followers = await followersOf(row.profileId, db)
  const change: Change = new Map([[row.profileId, { before: row.program, after: program }]])
  for (const f of followers) {
    change.set(f.profileId, {
      before: row.program && resolveProgram(row.program, f.overrides),
      after: resolveProgram(program, f.overrides),
    })
  }
  await guardToday(change, db)
  await db.programs.put({ ...row, program, updatedAt: now })
  const kept = new Set(program.days.flatMap((d) => d.mains.map((m) => m.id)))
  for (const f of followers) {
    const slots = f.overrides?.slots ?? {}
    if (Object.keys(slots).every((id) => kept.has(id))) continue
    const pruned = Object.fromEntries(Object.entries(slots).filter(([id]) => kept.has(id)))
    await db.programs.put({ ...f, overrides: { slots: pruned }, updatedAt: now })
  }
}

/** A follower's overrides, checked against their part of today's workout. */
async function putOverrides(row: ProgramRow, overrides: ProgramOverrides, db: WigwamDb, now: number): Promise<void> {
  const leader = row.followsProfileId ? (await db.programs.get(row.followsProfileId))?.program : undefined
  if (leader) {
    const change: Change = new Map([
      [row.profileId, { before: resolveProgram(leader, row.overrides), after: resolveProgram(leader, overrides) }],
    ])
    await guardToday(change, db)
  }
  await db.programs.put({ ...row, overrides, updatedAt: now })
}

const programTables = (db: WigwamDb) => [db.programs, db.profiles, db.sessions, db.entries, db.sets]

/**
 * Changes a profile's own program. The change is applied to the program as
 * stored, not as last shown, so two quick taps can't undo each other.
 * Followers change their overrides instead.
 */
export async function editProgram(
  profileId: string,
  change: (program: Program) => Program,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', programTables(db), async () => {
    const row = await db.programs.get(profileId)
    if (row?.followsProfileId) throw new Error('This profile follows someone else. Unfollow first, or change single lifts.')
    if (!row?.program) throw new Error('That profile has no program.')
    await putOwnProgram(row, change(row.program), db, now)
  })
}

/** Replaces a profile's own program outright. */
export async function saveProgram(
  profileId: string,
  program: Program,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  await editProgram(profileId, () => program, db, now)
}

export async function saveOverrides(
  profileId: string,
  overrides: ProgramOverrides,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', programTables(db), async () => {
    const row = await db.programs.get(profileId)
    if (!row?.followsProfileId) throw new Error("This profile doesn't follow anyone.")
    await putOverrides(row, overrides, db, now)
  })
}

/**
 * A follower's own version of one lift: what differs from the leader's
 * (see `overrideDiff`). It replaces any earlier change to that lift; no
 * changes, or undefined, goes back to the leader's.
 */
export async function overrideSlot(
  profileId: string,
  slotId: string,
  changes: Partial<SlotFields> | undefined,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', programTables(db), async () => {
    const row = await db.programs.get(profileId)
    if (!row?.followsProfileId) throw new Error("This profile doesn't follow anyone.")
    const cleared = clearOverride(row.overrides, slotId)
    const overrides = changes && Object.keys(changes).length ? setOverride(cleared, slotId, changes) : cleared
    await putOverrides(row, overrides, db, now)
  })
}

/**
 * Switches a profile to a copy of `source`: a preset, a saved program, a
 * blank one or someone's current one. Fresh ids mean this week's finished
 * days can't carry over by accident; the new days start as to-do. Anyone
 * following comes along, and their changes to the old lifts are dropped.
 */
export async function applyProgram(
  profileId: string,
  source: Program,
  name: string = source.name,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', programTables(db), async () => {
    const followers = await followersOf(profileId, db)
    await guardNotTraining([profileId, ...followers.map((f) => f.profileId)], db)
    await db.programs.put({ profileId, program: cloneProgram(source, name, newId), updatedAt: now })
    for (const f of followers) await db.programs.put({ ...f, overrides: { slots: {} }, updatedAt: now })
  })
}

/** Starts following a leader. Followers can't have followers of their own: one level only. */
export async function followProfile(
  profileId: string,
  leaderId: string,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', programTables(db), async () => {
    if (profileId === leaderId) throw new Error("A profile can't follow itself.")
    const leader = await db.programs.get(leaderId)
    if (!leader?.program || leader.followsProfileId) throw new Error('Follow the leader directly, not one of their followers.')
    if ((await followersOf(profileId, db)).length) throw new Error('Others follow this profile. They need to unfollow first.')
    await guardNotTraining([profileId], db)
    await db.programs.put({ profileId, followsProfileId: leaderId, overrides: { slots: {} }, updatedAt: now })
  })
}

/** Keeps a copy of the program as it is now, their own changes included, to edit freely. */
export const unfollow = detachFollower

/**
 * Turns today's swap into a lasting change: a program edit for someone
 * running their own program, an override for a follower. Today's swap is
 * then dropped, since the program now says the same thing.
 */
export async function makeSwapPermanent(entryId: string, slotId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', [...programTables(db), db.trainingMaxes], async () => {
    const entry = await db.entries.get(entryId)
    const exerciseId = entry?.swaps[slotId]
    if (!entry || !exerciseId) return
    const row = await db.programs.get(entry.profileId)
    const program = await loadProgram(entry.profileId, db)
    if (!row || !program) return
    const tms = await loadTms(entry.profileId, db)
    const slot: MainSlot = permanentSwap(program, slotId, exerciseId, (id) => tms[id] !== undefined, findExercise)
    const fields: SlotFields = {
      exerciseId: slot.exerciseId,
      tier: slot.tier,
      schemeId: slot.schemeId,
      tmExerciseId: slot.tmExerciseId,
      warmups: slot.warmups,
    }
    if (row.followsProfileId) await putOverrides(row, setOverride(row.overrides, slotId, fields), db, now)
    else if (row.program) await putOwnProgram(row, updateMainSlot(row.program, slotId, fields), db, now)
    const swaps = { ...entry.swaps }
    delete swaps[slotId]
    await db.entries.update(entryId, { swaps })
  })
}

export async function setProgressionTable(
  profileId: string,
  exerciseId: string,
  table: ProgressionTable | undefined,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    const profile = await db.profiles.get(profileId)
    if (!profile) return
    const tables = { ...profile.progressionTables }
    if (table) tables[exerciseId] = table
    else delete tables[exerciseId]
    await db.profiles.update(profileId, { progressionTables: tables })
  })
}

// Saved programs ("My programs").

export async function loadTemplates(db: WigwamDb = defaultDb): Promise<TemplateRow[]> {
  return (await db.templates.toArray()).sort((a, b) => a.createdAt - b.createdAt)
}

export async function saveTemplate(
  program: Program,
  name: string,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<string> {
  const copy = cloneProgram(program, name.trim() || program.name, newId)
  await db.templates.add({ ...copy, createdAt: now })
  return copy.id
}

export async function renameTemplate(id: string, name: string, db: WigwamDb = defaultDb): Promise<void> {
  if (name.trim()) await db.templates.update(id, { name: name.trim() })
}

/** Saved programs are blueprints: profiles run their own copies, so deleting one changes nobody's training. */
export async function deleteTemplate(id: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.templates.delete(id)
}
