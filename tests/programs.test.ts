import { afterEach, describe, expect, it } from 'vitest'
import { NSUNS_4DAY_ROW } from '../src/data/presets.ts'
import { findExercise } from '../src/data/exercises.ts'
import { findScheme, setCustomSchemes } from '../src/data/schemes.ts'
import { createProfile, loadProgram } from '../src/db/profiles.ts'
import {
  applyProgram,
  deleteTemplate,
  followProfile,
  loadTemplates,
  makeSwapPermanent,
  overrideSlot,
  saveProgram,
  saveTemplate,
  setProgressionTable,
  unfollow,
} from '../src/db/programs.ts'
import { deleteScheme, saveScheme } from '../src/db/schemes.ts'
import {
  addAccessory,
  logSet,
  rememberedPick,
  setFromPlan,
  startSession,
  swapExercise,
  updateAccessory,
} from '../src/db/sessions.ts'
import { loadWeekOverview, loadWeekReview } from '../src/db/weeks.ts'
import type { Program } from '../src/engine/program.ts'
import { addMainSlot, addPinned, removeDay, removeMainSlot, updateMainSlot } from '../src/engine/programEdit.ts'
import { addFollower, addLeader, doWorkout, freshDb, lifts, planFor } from './helpers.ts'

afterEach(() => setCustomSchemes([]))

let n = 0
const newId = () => `new-${++n}`
const slot = (p: Program | undefined, id: string) => p?.days.flatMap((d) => d.mains).find((m) => m.id === id)
const own = async (db: ReturnType<typeof freshDb>, id: string) => (await db.programs.get(id))!.program!

describe('editing a program mid-week', () => {
  it('changes the days still to come and leaves finished days and history alone', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await doWorkout(db, [{ profileId: lead, dayId: 'd1', star: 4, startWeight: 135 }], 1_000)
    await doWorkout(db, [{ profileId: lead, dayId: 'd2', star: 5 }], 2_000)
    const historyBefore = await db.sets.toArray()

    // Day 3's T2 becomes close-grip bench off the bench TM, plus a row; Day 1 changes too.
    let program = await own(db, lead)
    program = updateMainSlot(program, 'd3-t2', { exerciseId: 'close-grip-bench-press' })
    program = addMainSlot(program, 'd3', { exerciseId: 'pendlay-row', tier: 'T3', schemeId: 'range-4x6-8', warmups: false }, newId)
    program = updateMainSlot(program, 'd1-t2', { exerciseId: 'landmine-press', schemeId: 'range-3x8-12', tmExerciseId: undefined })
    await saveProgram(lead, program, db)

    const session = await startSession([{ profileId: lead, dayId: 'd3' }], 'home', db, 3_000)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    const { slots } = await planFor(db, lead, entry.id)
    expect(slots.map((s) => s.exerciseId)).toEqual(['overhead-press', 'close-grip-bench-press', 'pendlay-row'])
    expect(slots[1]!.sets[0]!.weight).toBe(90) // 40% of the bench TM, as the incline was

    expect(await db.sets.toArray()).toEqual(historyBefore)
    const week = (await loadWeekOverview(lead, db)).week!
    expect(week.days).toMatchObject({ d1: 'done', d2: 'done' })
    // Day 1's 1+ bench result still counts at Start Week.
    const review = await loadWeekReview(lead, db)
    expect(review!.proposals.find((p) => p.exerciseId === 'bench-press')).toMatchObject({ reps: 4, proposed: 230 })
  })

  it("won't drop or change a lift with sets logged in today's workout, but allows other changes", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const session = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    const bench = (await planFor(db, lead, entry.id)).slots[0]!
    await logSet(setFromPlan(entry, bench, 0, bench.sets[0]!, { weight: 170, reps: 5 }), undefined, db)

    const program = await own(db, lead)
    await expect(saveProgram(lead, removeMainSlot(program, 'd1-t1'), db)).rejects.toThrow('already logged sets')
    await expect(saveProgram(lead, updateMainSlot(program, 'd1-t1', { exerciseId: 'close-grip-bench-press' }), db)).rejects.toThrow(
      'already logged sets',
    )
    await expect(saveProgram(lead, removeDay(program, 'd1'), db)).rejects.toThrow('partway through')
    // Today's other lifts, and other days, are fair game.
    await saveProgram(lead, updateMainSlot(program, 'd1-t2', { exerciseId: 'landmine-press', schemeId: 'range-3x8-12' }), db)
    await saveProgram(lead, removeMainSlot(await own(db, lead), 'd4-t2'), db)
    expect(slot(await own(db, lead), 'd4-t2')).toBeUndefined()
    expect((await planFor(db, lead, entry.id)).slots.map((s) => s.exerciseId)).toEqual([
      'bench-press',
      'landmine-press',
      'barbell-row',
    ])
  })

  it("checks a follower's part of today's workout when the leader edits", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const session = await startSession([{ profileId: partner, dayId: 'd2' }], 'home', db)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    const squat = (await planFor(db, partner, entry.id)).slots[0]!
    await logSet(setFromPlan(entry, squat, 0, squat.sets[0]!, { weight: 135, reps: 5 }), undefined, db)

    const program = await own(db, lead)
    await expect(saveProgram(lead, updateMainSlot(program, 'd2-t1', { schemeId: 'nsuns-t1-bench' }), db)).rejects.toThrow(
      'Partner has already logged sets',
    )
    // Their own change to that lift would also pull it out from under them.
    await expect(overrideSlot(partner, 'd2-t1', { exerciseId: 'goblet-squat' }, db)).rejects.toThrow('already logged sets')
    await overrideSlot(partner, 'd2-t2', { exerciseId: 'deadlift', tmExerciseId: 'deadlift' }, db)
  })

  it("won't switch anyone in today's workout to a different program", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const solo = await addLeader(db, 'Solo', lifts(205, 245, 115, 295))
    await startSession([{ profileId: partner, dayId: 'd1' }], 'home', db)
    await expect(applyProgram(lead, NSUNS_4DAY_ROW, 'New', db)).rejects.toThrow("Partner is in today's workout")
    await applyProgram(solo, NSUNS_4DAY_ROW, 'New', db)
    expect((await own(db, solo)).name).toBe('New')
  })
})

describe('followers', () => {
  it("keep their change to a lift when the leader edits the same day", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    await overrideSlot(partner, 'd4-t1', { exerciseId: 'trap-bar-deadlift', tmExerciseId: 'deadlift' }, db)

    let program = await own(db, lead)
    program = updateMainSlot(program, 'd4-t2', { exerciseId: 'romanian-deadlift', schemeId: 'range-3x6-10', tmExerciseId: undefined })
    program = addMainSlot(program, 'd4', { exerciseId: 'barbell-row', tier: 'T3', schemeId: 'range-4x6-8', warmups: false }, newId)
    await saveProgram(lead, program, db)

    const theirs = await loadProgram(partner, db)
    expect(theirs!.days[3]!.mains.map((m) => m.exerciseId)).toEqual(['trap-bar-deadlift', 'romanian-deadlift', 'barbell-row'])
    await overrideSlot(partner, 'd4-t1', undefined, db)
    expect(slot(await loadProgram(partner, db), 'd4-t1')?.exerciseId).toBe('deadlift')
  })

  it("can't restructure the leader's program, but can unfollow and then do anything", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    await expect(saveProgram(partner, NSUNS_4DAY_ROW, db)).rejects.toThrow('Unfollow first')
    await unfollow(partner, db)
    const copy = await own(db, partner)
    await saveProgram(partner, removeMainSlot(copy, 'd1-t3'), db)
    expect((await own(db, partner)).days[0]!.mains).toHaveLength(2)
    expect((await own(db, lead)).days[0]!.mains).toHaveLength(3)
  })

  it('follow one level deep only', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const solo = await addLeader(db, 'Solo', lifts(205, 245, 115, 295))
    await expect(followProfile(solo, partner, db)).rejects.toThrow('leader directly')
    await expect(followProfile(lead, solo, db)).rejects.toThrow('Others follow this profile')
    await followProfile(solo, lead, db)
    expect((await db.programs.get(solo))?.followsProfileId).toBe(lead)
  })

  it("replace their change to a lift rather than pile up, and lose it when the lift's gone", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    await overrideSlot(partner, 'd3-t2', { exerciseId: 'db-incline-press', schemeId: 'range-3x8-12', tmExerciseId: 'db-incline-press' }, db)
    await overrideSlot(partner, 'd3-t2', { tier: 'T3' }, db)
    expect(slot(await loadProgram(partner, db), 'd3-t2')).toMatchObject({ exerciseId: 'incline-bench-press', tier: 'T3' })

    await overrideSlot(partner, 'd4-t2', { warmups: true }, db)
    await saveProgram(lead, removeMainSlot(await own(db, lead), 'd4-t2'), db)
    expect(Object.keys((await db.programs.get(partner))!.overrides!.slots)).toEqual(['d3-t2'])
    await applyProgram(lead, NSUNS_4DAY_ROW, 'Again', db)
    expect((await db.programs.get(partner))!.overrides).toEqual({ slots: {} })
  })
})

describe('switching programs', () => {
  it('copies the program with fresh ids, so this week carries on with the new days pending', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await doWorkout(db, [{ profileId: lead, dayId: 'd1', star: 4, startWeight: 135 }], 1_000)
    await applyProgram(lead, NSUNS_4DAY_ROW, 'Fresh start', db)
    const program = await own(db, lead)
    expect(program.name).toBe('Fresh start')
    expect(program.days.some((d) => d.id === 'd1')).toBe(false)
    const overview = await loadWeekOverview(lead, db)
    expect(overview.pending).toHaveLength(4)
    expect(overview.complete).toBe(false)
  })

  it('saves programs to reuse, and starts new profiles from one or from scratch', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const templateId = await saveTemplate(await own(db, lead), 'My 4-day', db, 5)
    expect((await loadTemplates(db)).map((t) => t.name)).toEqual(['My 4-day'])

    const fromTemplate = await createProfile(
      { name: 'T', color: '#000', program: { kind: 'template', templateId }, tms: {}, ratingPreset: 'blank' },
      db,
    )
    expect((await own(db, fromTemplate)).name).toBe('My 4-day')
    expect((await own(db, fromTemplate)).days[0]!.id).not.toBe((await loadTemplates(db))[0]!.days[0]!.id)

    const scratch = await createProfile(
      { name: 'Sam', color: '#000', program: { kind: 'blank', days: 3 }, tms: {}, ratingPreset: 'blank' },
      db,
    )
    const blank = await own(db, scratch)
    expect(blank.name).toBe("Sam's program")
    expect(blank.days.map((d) => d.mains.length)).toEqual([0, 0, 0])

    // Deleting the saved one leaves the profile started from it untouched.
    await deleteTemplate(templateId, db)
    expect((await own(db, fromTemplate)).days).toHaveLength(4)
  })
})

describe('making a swap permanent', () => {
  it("rewrites the leader's program and drops today's swap", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const session = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    await swapExercise(entry.id, 'd1-t2', 'landmine-press', db)
    await makeSwapPermanent(entry.id, 'd1-t2', db)
    expect(slot(await own(db, lead), 'd1-t2')).toMatchObject({ exerciseId: 'landmine-press', schemeId: 'range-3x8-12' })
    expect((await db.entries.get(entry.id))?.swaps).toEqual({})
  })

  it("becomes a follower's own change", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const session = await startSession([{ profileId: partner, dayId: 'd1' }], 'home', db)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    await swapExercise(entry.id, 'd1-t2', 'landmine-press', db)
    await makeSwapPermanent(entry.id, 'd1-t2', db)
    expect(slot(await loadProgram(partner, db), 'd1-t2')?.exerciseId).toBe('landmine-press')
    expect(slot(await own(db, lead), 'd1-t2')?.exerciseId).toBe('overhead-press')
  })

  it('works after sets are logged, and the plan for them stays the same', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const session = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    await swapExercise(entry.id, 'd1-t2', 'db-shoulder-press', db)
    const before = (await planFor(db, lead, entry.id)).slots[1]!
    await logSet(setFromPlan(entry, before, 0, before.sets[0]!, { weight: 50, reps: 10 }), undefined, db)
    await makeSwapPermanent(entry.id, 'd1-t2', db)
    const after = (await planFor(db, lead, entry.id)).slots[1]!
    expect(after.exerciseId).toBe('db-shoulder-press')
    expect(after.sets.map((s) => [s.reps, s.repsMax])).toEqual(before.sets.map((s) => [s.reps, s.repsMax]))
  })

  it("isn't allowed to pull a lift out from under a follower who's already on it", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const session = await startSession(
      [
        { profileId: lead, dayId: 'd1' },
        { profileId: partner, dayId: 'd1' },
      ],
      'home',
      db,
    )
    const entries = await db.entries.where('sessionId').equals(session).toArray()
    const mine = entries.find((e) => e.profileId === lead)!
    const theirs = entries.find((e) => e.profileId === partner)!
    const ohp = (await planFor(db, partner, theirs.id)).slots[1]!
    await logSet(setFromPlan(theirs, ohp, 0, ohp.sets[0]!, { weight: 50, reps: 6 }), undefined, db)
    await swapExercise(mine.id, 'd1-t2', 'landmine-press', db)
    await expect(makeSwapPermanent(mine.id, 'd1-t2', db)).rejects.toThrow('Partner has already logged sets')
    expect((await db.entries.get(mine.id))?.swaps).toEqual({ 'd1-t2': 'landmine-press' })
  })
})

describe('pinned accessories', () => {
  it("are in the day's workout from the start, at each person's own sets and reps", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    await saveProgram(lead, addPinned(await own(db, lead), 'd1', 'face-pull', newId), db)

    // The partner did face pulls their own way once.
    const first = await startSession([{ profileId: partner, dayId: 'd2' }], 'home', db, 1_000)
    const earlier = (await db.entries.where('sessionId').equals(first).first())!
    await addAccessory(earlier.id, 'face-pull', { forFollowers: false }, db)
    await updateAccessory(earlier.id, (await db.entries.get(earlier.id))!.accessories[0]!.id, { sets: 4, reps: [15, 20] }, db)
    await db.sessions.update(first, { status: 'done' })

    const session = await startSession(
      [
        { profileId: lead, dayId: 'd1' },
        { profileId: partner, dayId: 'd1' },
      ],
      'home',
      db,
      2_000,
    )
    const picks = async (profileId: string) =>
      (await db.entries.where('sessionId').equals(session).toArray()).find((e) => e.profileId === profileId)!.accessories
    const usual = findExercise('face-pull')!
    expect(await picks(lead)).toMatchObject([{ exerciseId: 'face-pull', sets: usual.sets, reps: usual.reps, pinned: true }])
    expect(await picks(partner)).toMatchObject([{ exerciseId: 'face-pull', sets: 4, reps: [15, 20], pinned: true }])
  })
})

describe('progression tables', () => {
  it("change a person's bump for a lift", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await doWorkout(db, [{ profileId: lead, dayId: 'd1', star: 4, startWeight: 135 }], 1_000)
    const slow = [
      { minReps: 0, increase: 0 },
      { minReps: 4, increase: 2.5 },
    ]
    await setProgressionTable(lead, 'bench-press', slow, db)
    const bench = (await loadWeekReview(lead, db))!.proposals.find((p) => p.exerciseId === 'bench-press')
    expect(bench?.proposed).toBe(227.5)
    await setProgressionTable(lead, 'bench-press', undefined, db)
    expect((await db.profiles.get(lead))?.progressionTables).toEqual({})
  })
})

describe('custom schemes', () => {
  const pyramid = {
    kind: 'percent' as const,
    name: 'Heavy triple',
    sets: [
      { pct: 80, reps: 3 },
      { pct: 90, reps: 3, amrap: true, progression: true },
    ],
  }

  it('are checked, saved and found like built-ins', async () => {
    const db = freshDb()
    await expect(saveScheme({ ...pyramid, name: ' ' }, db)).rejects.toThrow('name')
    await expect(
      saveScheme({ ...pyramid, sets: [...pyramid.sets, { pct: 95, reps: 1, progression: true }] }, db),
    ).rejects.toThrow('Only one set')
    const id = await saveScheme(pyramid, db)
    expect(id).toMatch(/^custom-scheme-heavy-triple-/)
    expect(findScheme(id)).toMatchObject({ name: 'Heavy triple', kind: 'percent' })
  })

  it("can't be deleted while a program runs them", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const id = await saveScheme(pyramid, db)
    await saveProgram(lead, updateMainSlot(await own(db, lead), 'd1-t1', { schemeId: id }), db)
    await expect(deleteScheme(id, db)).rejects.toThrow('In use by Lead')
    await saveProgram(lead, updateMainSlot(await own(db, lead), 'd1-t1', { schemeId: 'nsuns-t1-bench' }), db)
    await deleteScheme(id, db)
    expect(await db.schemes.count()).toBe(0)
  })
})

describe('accessory sets and reps', () => {
  it('can be changed today and are remembered for next time', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const first = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db, 1_000)
    const entry = (await db.entries.where('sessionId').equals(first).first())!
    await addAccessory(entry.id, 'face-pull', { forFollowers: false }, db)
    const pickId = (await db.entries.get(entry.id))!.accessories[0]!.id
    await updateAccessory(entry.id, pickId, { sets: 4, reps: [12, 15] }, db)
    expect(await rememberedPick(lead, 'face-pull', db)).toMatchObject({ sets: 4, reps: [12, 15] })
    await expect(updateAccessory(entry.id, pickId, { sets: 0, reps: [12, 15] }, db)).rejects.toThrow()
    const plan = (await planFor(db, lead, entry.id)).slots.find((s) => s.slotId === pickId)!
    for (const i of [0, 1]) await logSet(setFromPlan(entry, plan, i, plan.sets[i]!, { weight: 30, reps: 15 }), undefined, db)
    await expect(updateAccessory(entry.id, pickId, { sets: 1, reps: [12, 15] }, db)).rejects.toThrow('2 sets are already logged')
  })
})
