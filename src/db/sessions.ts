import { findExercise } from '../data/exercises.ts'
import type { AccessoryPick, PlannedSet, PlannedSlot } from '../engine/plan.ts'
import type { Stars } from '../engine/types.ts'
import { db as defaultDb, newId, type EntryRow, type SessionRow, type SetRow, type WigwamDb } from './db.ts'
import { loadProgram } from './profiles.ts'
import { completedAtFor, ensureFirstWeek, loadWeekOverview } from './weeks.ts'

// Everything about a workout in progress is written here the moment it
// happens: the sets, today's swaps and accessories, whose tab is open, each
// person's rest countdown. Killing the app loses nothing.

export async function activeSession(db: WigwamDb = defaultDb): Promise<SessionRow | undefined> {
  return db.sessions.where('status').equals('active').first()
}

export interface Participant {
  profileId: string
  dayId: string
}

export async function startSession(
  participants: Participant[],
  gymId = 'home',
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<string> {
  const first = participants[0]
  if (!first) throw new Error('Pick at least one person.')
  const sessionId = newId()
  await db.transaction('rw', [db.sessions, db.entries, db.weeks, db.programs, db.profiles], async () => {
    if (await activeSession(db)) throw new Error('A workout is already going. Finish it first.')
    for (const p of participants) {
      const week = await ensureFirstWeek(p.profileId, db, now)
      const overview = await loadWeekOverview(p.profileId, db)
      const name = (await db.profiles.get(p.profileId))?.name ?? 'Someone'
      if (overview.complete) throw new Error(`${name}'s week is finished. Start the next week first.`)
      if (!overview.pending.some((d) => d.id === p.dayId)) throw new Error(`${name} has already done that day.`)
      await db.entries.add({
        id: newId(),
        sessionId,
        profileId: p.profileId,
        weekId: week.id,
        dayId: p.dayId,
        swaps: {},
        accessories: [],
        status: 'active',
      })
    }
    await db.sessions.add({
      id: sessionId,
      status: 'active',
      startedAt: now,
      gymId,
      participants: participants.map((p) => p.profileId),
      activeProfileId: first.profileId,
      rotate: participants.length > 1,
    })
  })
  return sessionId
}

export type NewSet = Omit<SetRow, 'id' | 'at'>

/** A set to log, with the prescription copied in from the plan. */
export function setFromPlan(
  entry: Pick<EntryRow, 'id' | 'profileId' | 'sessionId' | 'weekId' | 'dayId'>,
  slot: PlannedSlot,
  index: number,
  planned: PlannedSet,
  actual: { weight: number; reps: number; rpe?: number; note?: string },
  warmup = false,
): NewSet {
  return {
    profileId: entry.profileId,
    sessionId: entry.sessionId,
    entryId: entry.id,
    weekId: entry.weekId,
    dayId: entry.dayId,
    slotId: slot.slotId,
    index,
    role: slot.role,
    exerciseId: slot.exerciseId,
    warmup,
    prescribedWeight: planned.weight,
    prescribedReps: planned.reps,
    prescribedRepsMax: planned.repsMax,
    pct: planned.pct,
    amrap: planned.amrap,
    progression: planned.progression,
    tmTest: planned.tmTest,
    tmExerciseId: slot.tmExerciseId,
    tm: slot.tm,
    ...actual,
  }
}

/** Logs a set and starts that person's rest in one write, so neither is ever saved without the other. */
export async function logSet(
  set: NewSet,
  restSeconds: number | undefined,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<string> {
  const id = newId()
  await db.transaction('rw', [db.sets, db.entries], async () => {
    await db.sets.add({ ...set, id, at: now })
    if (restSeconds) await db.entries.update(set.entryId, { restEndsAt: now + restSeconds * 1000, restSeconds })
  })
  return id
}

/** All of a lift's warm-ups in one tap. */
export async function logWarmups(sets: NewSet[], db: WigwamDb = defaultDb, now = Date.now()): Promise<string[]> {
  // A millisecond apart, so they keep their order in history.
  const rows = sets.map((s, i) => ({ ...s, id: newId(), at: now + i }))
  await db.sets.bulkAdd(rows)
  return rows.map((r) => r.id)
}

export async function updateSet(
  id: string,
  changes: Partial<Pick<SetRow, 'weight' | 'reps' | 'rpe' | 'note'>>,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.sets.update(id, changes)
}

export async function deleteSets(ids: string[], db: WigwamDb = defaultDb): Promise<void> {
  await db.sets.bulkDelete(ids)
}

export async function setActiveProfile(sessionId: string, profileId: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.sessions.update(sessionId, { activeProfileId: profileId })
}

export async function setRotate(sessionId: string, rotate: boolean, db: WigwamDb = defaultDb): Promise<void> {
  await db.sessions.update(sessionId, { rotate })
}

/** Undefined clears the countdown. */
export async function setRest(
  entryId: string,
  restEndsAt: number | undefined,
  restSeconds: number | undefined,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.entries.update(entryId, { restEndsAt, restSeconds })
}

async function workingSetsLogged(entryId: string, slotId: string, db: WigwamDb): Promise<number> {
  return db.sets
    .where('entryId')
    .equals(entryId)
    .filter((s) => s.slotId === slotId && !s.warmup)
    .count()
}

/** Today only. Undefined puts the programmed lift back. */
export async function swapExercise(
  entryId: string,
  slotId: string,
  exerciseId: string | undefined,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', [db.entries, db.sets], async () => {
    // Half a slot logged as one lift and half as another would be nonsense.
    if (await workingSetsLogged(entryId, slotId, db)) throw new Error('Sets are already logged for that lift.')
    const entry = await db.entries.get(entryId)
    if (!entry) return
    const swaps = { ...entry.swaps }
    if (exerciseId) swaps[slotId] = exerciseId
    else delete swaps[slotId]
    await db.entries.update(entryId, { swaps })
  })
}

/**
 * Adds an accessory for today. With `forFollowers`, everyone in the session
 * who follows this person gets it too, unless they already have it.
 */
export async function addAccessory(
  entryId: string,
  exerciseId: string,
  options: { forFollowers: boolean },
  db: WigwamDb = defaultDb,
): Promise<void> {
  const exercise = findExercise(exerciseId)
  if (!exercise) throw new Error(`Unknown exercise "${exerciseId}".`)
  const pick = (): AccessoryPick => ({ id: newId(), exerciseId, sets: exercise.sets, reps: [exercise.reps[0], exercise.reps[1]] })

  await db.transaction('rw', [db.entries, db.programs], async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) return
    await db.entries.update(entryId, { accessories: [...entry.accessories, pick()] })
    if (!options.forFollowers) return
    const followers = new Set(
      (await db.programs.where('followsProfileId').equals(entry.profileId).toArray()).map((p) => p.profileId),
    )
    for (const other of await db.entries.where('sessionId').equals(entry.sessionId).toArray()) {
      if (!followers.has(other.profileId) || other.accessories.some((a) => a.exerciseId === exerciseId)) continue
      await db.entries.update(other.id, { accessories: [...other.accessories, pick()] })
    }
  })
}

export async function removeAccessory(entryId: string, pickId: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.transaction('rw', [db.entries, db.sets], async () => {
    if (await workingSetsLogged(entryId, pickId, db)) throw new Error('Sets are already logged for that one.')
    const entry = await db.entries.get(entryId)
    if (entry) await db.entries.update(entryId, { accessories: entry.accessories.filter((a) => a.id !== pickId) })
  })
}

export async function setEntryNotes(entryId: string, notes: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.entries.update(entryId, { notes })
}

/** Remembers an exercise folded or opened by hand, so it stays that way through a reload. */
export async function setCollapsed(
  entryId: string,
  slotId: string,
  collapsed: boolean,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.entries, async () => {
    const entry = await db.entries.get(entryId)
    if (entry) await db.entries.update(entryId, { collapsed: { ...entry.collapsed, [slotId]: collapsed } })
  })
}

/** How the whole workout felt. Undefined clears it. */
export async function rateEntry(entryId: string, rating: Stars | undefined, db: WigwamDb = defaultDb): Promise<void> {
  await db.entries.update(entryId, { rating })
}

/**
 * Marks each person's day done if they logged at least one working set.
 * Someone who logged nothing keeps the day pending to do another time.
 */
export async function finishSession(sessionId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', [db.sessions, db.entries, db.sets, db.weeks, db.programs], async () => {
    for (const entry of await db.entries.where('sessionId').equals(sessionId).toArray()) {
      const worked = await db.sets
        .where('entryId')
        .equals(entry.id)
        .filter((s) => !s.warmup)
        .count()
      const week = worked > 0 ? await db.weeks.get(entry.weekId) : undefined
      if (week) {
        const days = { ...week.days, [entry.dayId]: 'done' as const }
        const program = await loadProgram(entry.profileId, db)
        await db.weeks.update(week.id, { days, completedAt: completedAtFor(week, days, program, now) })
      }
      await db.entries.update(entry.id, {
        status: worked > 0 ? 'done' : 'empty',
        restEndsAt: undefined,
        restSeconds: undefined,
      })
    }
    await db.sessions.update(sessionId, { status: 'done', endedAt: now })
  })
}

/** For a workout started by mistake. Refuses once anything has been logged. */
export async function discardSession(sessionId: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.transaction('rw', [db.sessions, db.entries, db.sets], async () => {
    if (await db.sets.where('sessionId').equals(sessionId).count()) {
      throw new Error('Sets are logged in this workout. Finish it instead.')
    }
    await db.entries.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
  })
}
