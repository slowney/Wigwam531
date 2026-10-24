import { findExercise } from '../data/exercises.ts'
import type { AccessoryPick, PlannedSet, PlannedSlot } from '../engine/plan.ts'
import type { AccessoryGroup } from '../engine/program.ts'
import type { Stars } from '../engine/types.ts'
import { db as defaultDb, newId, type EntryRow, type SessionRow, type SetRow, type WigwamDb } from './db.ts'
import { loadProgram } from './profiles.ts'
import { completedAtFor, currentWeek, ensureFirstWeek, loadWeekOverview } from './weeks.ts'

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
      const day = overview.pending.find((d) => d.id === p.dayId)
      if (!day) throw new Error(`${name} has already done that day.`)
      // Pinned accessories become today's picks like any other, so they can
      // be resized or dropped for today without touching the program.
      const pinned: AccessoryPick[] = []
      for (const slot of day.accessories) {
        if (slot.kind !== 'pinned') continue
        const pick = await pickFor(p.profileId, slot.exerciseId, db)
        if (pick) pinned.push({ ...pick, pinned: true })
      }
      await db.entries.add({
        id: newId(),
        sessionId,
        profileId: p.profileId,
        weekId: week.id,
        dayId: p.dayId,
        swaps: {},
        accessories: pinned,
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
    // A nudged weight has done its job once a set is logged: that set's weight carries on.
    const entry = await db.entries.get(set.entryId)
    if (entry?.weights?.[set.slotId] !== undefined) {
      const weights = { ...entry.weights }
      delete weights[set.slotId]
      await db.entries.update(set.entryId, { weights })
    }
  })
  return id
}

/** Leaves a set out of today's workout, or puts it back. Not once it's logged. */
export async function skipSet(
  entryId: string,
  slotId: string,
  index: number,
  skipped: boolean,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', [db.entries, db.sets], async () => {
    const logged = await db.sets
      .where('entryId')
      .equals(entryId)
      .filter((s) => !s.warmup && s.slotId === slotId && s.index === index)
      .count()
    if (logged && skipped) throw new Error("That set's already logged. Delete it instead.")
    const entry = await db.entries.get(entryId)
    if (!entry) return
    const now = new Set(entry.skips?.[slotId] ?? [])
    if (skipped) now.add(index)
    else now.delete(index)
    const skips = { ...entry.skips, [slotId]: [...now].sort((a, b) => a - b) }
    if (skips[slotId]!.length === 0) delete skips[slotId]
    await db.entries.update(entryId, { skips })
  })
}

/** Today's weight for a rep-range exercise, nudged before the next set. Undefined goes back to the plan's. */
export async function setSlotWeight(
  entryId: string,
  slotId: string,
  weight: number | undefined,
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.entries, async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) return
    const weights = { ...entry.weights }
    if (weight === undefined) delete weights[slotId]
    else weights[slotId] = weight
    await db.entries.update(entryId, { weights })
  })
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

  await db.transaction('rw', [db.entries, db.programs, db.sessions], async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) return
    const pick = async (profileId: string) => (await pickFor(profileId, exerciseId, db))!
    await db.entries.update(entryId, { accessories: [...entry.accessories, await pick(entry.profileId)] })
    if (!options.forFollowers) return
    const followers = new Set(
      (await db.programs.where('followsProfileId').equals(entry.profileId).toArray()).map((p) => p.profileId),
    )
    for (const other of await db.entries.where('sessionId').equals(entry.sessionId).toArray()) {
      if (!followers.has(other.profileId) || other.accessories.some((a) => a.exerciseId === exerciseId)) continue
      await db.entries.update(other.id, { accessories: [...other.accessories, await pick(other.profileId)] })
    }
  })
}

/**
 * Adds a day's accessory group: each of its exercises not already in today's
 * workout, at the group's sets and reps. With `forFollowers`, the same goes
 * to everyone in the session who follows this person. The group is noted
 * on each workout it went into, for ranking it next time.
 */
export async function applyAccessoryGroup(
  entryId: string,
  group: AccessoryGroup,
  options: { forFollowers: boolean },
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', [db.entries, db.programs], async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) return
    const add = async (target: EntryRow) => {
      const have = new Set(target.accessories.map((a) => a.exerciseId))
      const picks: AccessoryPick[] = group.items
        .filter((i) => !have.has(i.exerciseId) && findExercise(i.exerciseId))
        .map((i) => ({ id: newId(), exerciseId: i.exerciseId, sets: i.sets, reps: [i.reps[0], i.reps[1]] }))
      await db.entries.update(target.id, {
        accessories: [...target.accessories, ...picks],
        groups: [...new Set([...(target.groups ?? []), group.id])],
      })
    }
    await add(entry)
    if (!options.forFollowers) return
    const followers = new Set(
      (await db.programs.where('followsProfileId').equals(entry.profileId).toArray()).map((p) => p.profileId),
    )
    for (const other of await db.entries.where('sessionId').equals(entry.sessionId).toArray()) {
      if (followers.has(other.profileId)) await add(other)
    }
  })
}

/** A new pick, at this person's own last sets × reps for it, else the library's. */
async function pickFor(profileId: string, exerciseId: string, db: WigwamDb): Promise<AccessoryPick | undefined> {
  const exercise = findExercise(exerciseId)
  if (!exercise) return undefined
  const last = await rememberedPick(profileId, exerciseId, db)
  return {
    id: newId(),
    exerciseId,
    sets: last?.sets ?? exercise.sets,
    reps: last ? [last.reps[0], last.reps[1]] : [exercise.reps[0], exercise.reps[1]],
  }
}

/** The sets × reps this person used the last time they picked this accessory. */
export async function rememberedPick(
  profileId: string,
  exerciseId: string,
  db: WigwamDb = defaultDb,
): Promise<AccessoryPick | undefined> {
  let latest: { at: number; pick: AccessoryPick } | undefined
  for (const entry of await db.entries.where('profileId').equals(profileId).toArray()) {
    const pick = [...entry.accessories].reverse().find((a) => a.exerciseId === exerciseId)
    if (!pick) continue
    const at = (await db.sessions.get(entry.sessionId))?.startedAt ?? 0
    if (!latest || at >= latest.at) latest = { at, pick }
  }
  return latest?.pick
}

/** Today's sets × reps for an accessory. It's remembered for next time through `rememberedPick`. */
export async function updateAccessory(
  entryId: string,
  pickId: string,
  changes: { sets: number; reps: [number, number] },
  db: WigwamDb = defaultDb,
): Promise<void> {
  if (!(changes.sets >= 1 && changes.reps[0] >= 1 && changes.reps[0] <= changes.reps[1])) {
    throw new Error('Sets and reps need to be at least 1, low end first.')
  }
  await db.transaction('rw', [db.entries, db.sets], async () => {
    const logged = await workingSetsLogged(entryId, pickId, db)
    if (changes.sets < logged) throw new Error(`${logged} sets are already logged for it today.`)
    const entry = await db.entries.get(entryId)
    if (!entry) return
    await db.entries.update(entryId, {
      accessories: entry.accessories.map((a) =>
        a.id === pickId ? { ...a, sets: changes.sets, reps: [changes.reps[0], changes.reps[1]] } : a,
      ),
    })
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

/**
 * Removes a finished workout and every set logged in it: a dummy run, or
 * one logged by mistake. Its days go back to to-do while their week is
 * still going. In a week that has ended they count as skipped, since
 * nothing is logged for them any more. A TM Start Week already moved
 * because of it stays where it is.
 */
export async function deleteSession(sessionId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', [db.sessions, db.entries, db.sets, db.weeks, db.programs], async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) return
    if (session.status === 'active') throw new Error('This workout is still going. Finish or discard it instead.')
    for (const entry of await db.entries.where('sessionId').equals(sessionId).toArray()) {
      const week = entry.status === 'done' ? await db.weeks.get(entry.weekId) : undefined
      if (!week) continue
      const days = { ...week.days }
      if (week.endedAt === undefined) {
        delete days[entry.dayId]
        const program = await loadProgram(entry.profileId, db)
        await db.weeks.update(week.id, { days, completedAt: completedAtFor(week, days, program, now) })
      } else {
        await db.weeks.update(week.id, { days: { ...days, [entry.dayId]: 'skipped' } })
      }
    }
    await db.sets.where('sessionId').equals(sessionId).delete()
    await db.entries.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
  })
}

/**
 * Puts a finished workout back in progress with everything logged kept,
 * for one finished too early. Its days go back to to-do until it's
 * finished again. Not once anyone in it has moved on to a later week, and
 * not while another workout is going.
 */
export async function reopenSession(sessionId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', [db.sessions, db.entries, db.weeks, db.programs, db.profiles], async () => {
    const session = await db.sessions.get(sessionId)
    if (!session || session.status === 'active') return
    if (await activeSession(db)) throw new Error('A workout is already going. Finish it first.')
    const entries = await db.entries.where('sessionId').equals(sessionId).toArray()
    for (const entry of entries) {
      const name = (await db.profiles.get(entry.profileId))?.name ?? 'Someone'
      const week = await currentWeek(entry.profileId, db)
      if (week?.id !== entry.weekId || week.endedAt !== undefined) {
        throw new Error(`${name}'s week has ended since, so this workout can't be reopened.`)
      }
      if (!(await loadProgram(entry.profileId, db))?.days.some((d) => d.id === entry.dayId)) {
        throw new Error(`That day isn't in ${name}'s program any more.`)
      }
      // Logged nothing here, then did the day in another workout since.
      if (entry.status === 'empty' && week.days[entry.dayId] === 'done') {
        throw new Error(`${name} has done that day in another workout since.`)
      }
    }
    for (const entry of entries) {
      const week = entry.status === 'done' ? await db.weeks.get(entry.weekId) : undefined
      if (week) {
        const days = { ...week.days }
        delete days[entry.dayId]
        const program = await loadProgram(entry.profileId, db)
        await db.weeks.update(week.id, { days, completedAt: completedAtFor(week, days, program, now) })
      }
      await db.entries.update(entry.id, { status: 'active' })
    }
    await db.sessions.update(sessionId, { status: 'active', endedAt: undefined })
  })
}
