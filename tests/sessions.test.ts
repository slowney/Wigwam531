import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/db.ts'
import {
  activeSession,
  addAccessory,
  discardSession,
  finishSession,
  logSet,
  logWarmups,
  rateEntry,
  removeAccessory,
  setActiveProfile,
  setCollapsed,
  setFromPlan,
  setRest,
  startSession,
  swapExercise,
} from '../src/db/sessions.ts'
import { endWeek, ensureFirstWeek, setDayStatus } from '../src/db/weeks.ts'
import { addFollower, addLeader, freshDb, lifts, planFor } from './helpers.ts'

async function entryOf(db: ReturnType<typeof freshDb>, sessionId: string, profileId: string) {
  return (await db.entries.where('sessionId').equals(sessionId).toArray()).find((e) => e.profileId === profileId)!
}

describe('starting a workout', () => {
  it('creates an entry per person, starting Week 1 for anyone new', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const id = await startSession(
      [
        { profileId: lead, dayId: 'd1' },
        { profileId: partner, dayId: 'd2' },
      ],
      'home',
      db,
      100,
    )
    expect(await activeSession(db)).toMatchObject({ id, activeProfileId: lead, rotate: true, participants: [lead, partner] })
    expect((await entryOf(db, id, partner)).dayId).toBe('d2')
    expect(await db.weeks.count()).toBe(2)
  })

  it('only allows one workout at a time', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    await expect(startSession([{ profileId: lead, dayId: 'd2' }], 'home', db)).rejects.toThrow('already going')
  })

  it("refuses a day that's done, or a week that's finished", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const week = await ensureFirstWeek(lead, db)
    await setDayStatus(week.id, 'd1', 'done', db)
    await expect(startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)).rejects.toThrow('already done')
    await endWeek(week.id, db)
    await expect(startSession([{ profileId: lead, dayId: 'd2' }], 'home', db)).rejects.toThrow('Start the next week')
  })
})

describe('logging', () => {
  it('saves the set and that person\'s rest together', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const id = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = await entryOf(db, id, lead)
    const { slots } = await planFor(db, lead, entry.id)
    const bench = slots[0]!

    const setId = await logSet(setFromPlan(entry, bench, 0, bench.sets[0]!, { weight: 170, reps: 5 }), 120, db, 1000)
    expect(await db.sets.get(setId)).toMatchObject({
      exerciseId: 'bench-press',
      prescribedWeight: 170,
      pct: 75,
      tm: 225,
      tmExerciseId: 'bench-press',
      weight: 170,
      reps: 5,
      at: 1000,
    })
    expect(await db.entries.get(entry.id)).toMatchObject({ restEndsAt: 121_000, restSeconds: 120 })
    await setRest(entry.id, undefined, undefined, db)
    expect((await db.entries.get(entry.id))?.restEndsAt).toBeUndefined()
  })

  it('logs all of a lift\'s warm-ups in one go, in order', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const id = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = await entryOf(db, id, lead)
    const bench = (await planFor(db, lead, entry.id)).slots[0]!
    await logWarmups(
      bench.warmups.map((w, i) => setFromPlan(entry, bench, i, w, { weight: w.weight!, reps: w.reps }, true)),
      db,
      500,
    )
    const logged = await db.sets.where('entryId').equals(entry.id).sortBy('at')
    expect(logged.map((s) => [s.weight, s.warmup])).toEqual([
      [45, true],
      [90, true],
      [115, true],
      [135, true],
    ])
  })
})

describe('today-only changes', () => {
  it('shares an accessory with followers in the session, once', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const other = await addLeader(db, 'Solo', lifts(205, 245, 115, 295))
    const id = await startSession(
      [lead, partner, other].map((profileId) => ({ profileId, dayId: 'd1' })),
      'home',
      db,
    )
    await addAccessory((await entryOf(db, id, lead)).id, 'db-row', { forFollowers: true }, db)
    await addAccessory((await entryOf(db, id, lead)).id, 'db-row', { forFollowers: true }, db)

    expect((await entryOf(db, id, lead)).accessories.map((a) => a.exerciseId)).toEqual(['db-row', 'db-row'])
    expect((await entryOf(db, id, partner)).accessories).toMatchObject([{ exerciseId: 'db-row', sets: 3, reps: [6, 10] }])
    expect((await entryOf(db, id, other)).accessories).toEqual([])
  })

  it("won't swap or remove something once its sets are logged", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const id = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = await entryOf(db, id, lead)
    await addAccessory(entry.id, 'db-curl', { forFollowers: false }, db)
    await swapExercise(entry.id, 'd1-t2', 'landmine-press', db)
    expect((await db.entries.get(entry.id))?.swaps).toEqual({ 'd1-t2': 'landmine-press' })

    const { slots } = await planFor(db, lead, entry.id)
    const curl = slots.find((s) => s.role === 'accessory')!
    await logSet(setFromPlan(entry, slots[0]!, 0, slots[0]!.sets[0]!, { weight: 170, reps: 5 }), undefined, db)
    await logSet(setFromPlan(entry, curl, 0, curl.sets[0]!, { weight: 30, reps: 12 }), undefined, db)

    await expect(swapExercise(entry.id, 'd1-t1', 'db-bench-press', db)).rejects.toThrow('already logged')
    await expect(removeAccessory(entry.id, curl.slotId, db)).rejects.toThrow('already logged')
    await swapExercise(entry.id, 'd1-t2', undefined, db)
    expect((await db.entries.get(entry.id))?.swaps).toEqual({})
  })
})

describe('folding and rating', () => {
  it('remembers exercises folded by hand and the workout rating', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const id = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = await entryOf(db, id, lead)

    await setCollapsed(entry.id, 'd1-t1', true, db)
    await setCollapsed(entry.id, 'd1-t2', false, db)
    await rateEntry(entry.id, 4, db)
    expect(await db.entries.get(entry.id)).toMatchObject({
      collapsed: { 'd1-t1': true, 'd1-t2': false },
      rating: 4,
    })

    await rateEntry(entry.id, undefined, db)
    expect((await db.entries.get(entry.id))?.rating).toBeUndefined()
  })
})

describe('finishing', () => {
  it("marks each person's day done, unless they logged nothing", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const id = await startSession(
      [lead, partner].map((profileId) => ({ profileId, dayId: 'd1' })),
      'home',
      db,
    )
    const entry = await entryOf(db, id, lead)
    const bench = (await planFor(db, lead, entry.id)).slots[0]!
    await logSet(setFromPlan(entry, bench, 0, bench.sets[0]!, { weight: 170, reps: 5 }), 120, db)

    await finishSession(id, db, 5000)
    expect(await db.sessions.get(id)).toMatchObject({ status: 'done', endedAt: 5000 })
    expect(await entryOf(db, id, lead)).toMatchObject({ status: 'done' })
    expect((await entryOf(db, id, lead)).restEndsAt).toBeUndefined()
    expect(await entryOf(db, id, partner)).toMatchObject({ status: 'empty' })
    const weeks = await db.weeks.toArray()
    expect(weeks.find((w) => w.profileId === lead)?.days).toEqual({ d1: 'done' })
    expect(weeks.find((w) => w.profileId === partner)?.days).toEqual({})
    expect(await activeSession(db)).toBeUndefined()
  })

  it('can throw away a workout started by mistake, but not one with sets in it', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const id = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = await entryOf(db, id, lead)
    const bench = (await planFor(db, lead, entry.id)).slots[0]!
    const setId = await logSet(setFromPlan(entry, bench, 0, bench.sets[0]!, { weight: 170, reps: 5 }), undefined, db)
    await expect(discardSession(id, db)).rejects.toThrow('Finish it instead')
    await db.sets.delete(setId)
    await discardSession(id, db)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.entries.count()).toBe(0)
  })
})

describe('the app being killed mid-workout', () => {
  it('reopens on the same tab, with the same sets and rest countdown', async () => {
    const name = `test-kill-${crypto.randomUUID()}`
    const db = openDb(name)
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const id = await startSession(
      [lead, partner].map((profileId) => ({ profileId, dayId: 'd1' })),
      'home',
      db,
      0,
    )
    const entry = await entryOf(db, id, lead)
    const bench = (await planFor(db, lead, entry.id)).slots[0]!
    await logSet(setFromPlan(entry, bench, 0, bench.sets[0]!, { weight: 170, reps: 5 }), 120, db, 1000)
    await setActiveProfile(id, partner, db)
    db.close()

    const reopened = openDb(name)
    expect(await activeSession(reopened)).toMatchObject({ id, activeProfileId: partner })
    expect(await reopened.entries.get(entry.id)).toMatchObject({ restEndsAt: 121_000 })
    expect(await reopened.sets.where('sessionId').equals(id).count()).toBe(1)
    reopened.close()
  })
})
