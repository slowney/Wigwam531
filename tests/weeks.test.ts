import { describe, expect, it } from 'vitest'
import { loadTms } from '../src/db/profiles.ts'
import {
  endWeek,
  ensureFirstWeek,
  loadWeekOverview,
  loadWeekReview,
  setDayStatus,
  startWeeks,
} from '../src/db/weeks.ts'
import { addLeader, doWorkout, freshDb, lifts } from './helpers.ts'

describe('weeks', () => {
  it("start a new profile's Week 1 once, on its own", async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const overview = await loadWeekOverview(id, db)
    expect(overview.week).toBeUndefined()
    expect(overview.pending.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4'])

    const week = await ensureFirstWeek(id, db, 10)
    expect(await ensureFirstWeek(id, db, 20)).toEqual(week)
    expect(week).toMatchObject({ number: 1, type: 'normal', days: {} })
  })

  it('are complete once every day is done or skipped', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const week = await ensureFirstWeek(id, db)
    for (const day of ['d1', 'd2', 'd3']) await setDayStatus(week.id, day, 'done', db)
    expect((await loadWeekOverview(id, db)).complete).toBe(false)
    await setDayStatus(week.id, 'd4', 'skipped', db)
    expect((await loadWeekOverview(id, db)).complete).toBe(true)
  })

  it('can be ended early, skipping whatever is left', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const week = await ensureFirstWeek(id, db)
    await setDayStatus(week.id, 'd1', 'done', db)
    await endWeek(week.id, db, 99)
    expect(await db.weeks.get(week.id)).toMatchObject({
      endedAt: 99,
      completedAt: 99,
      days: { d1: 'done', d2: 'skipped', d3: 'skipped', d4: 'skipped' },
    })
    expect((await loadWeekOverview(id, db)).complete).toBe(true)
  })
})

describe('finishing a week', () => {
  it('is stamped the moment the last day is done or skipped, and unstamped by an unskip', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await doWorkout(db, [{ profileId: id, dayId: 'd1', star: 4, startWeight: 135 }], 1_000)
    await doWorkout(db, [{ profileId: id, dayId: 'd2', star: 4 }], 2_000)
    await doWorkout(db, [{ profileId: id, dayId: 'd3', star: 4 }], 3_000)
    const week = (await loadWeekOverview(id, db)).week!
    expect(week.completedAt).toBeUndefined()

    await setDayStatus(week.id, 'd4', 'skipped', db, 9_000)
    expect((await db.weeks.get(week.id))?.completedAt).toBe(9_000)
    await setDayStatus(week.id, 'd4', 'pending', db, 9_500)
    expect((await db.weeks.get(week.id))?.completedAt).toBeUndefined()

    // Finishing the last day in a workout stamps it at the workout's end.
    await doWorkout(db, [{ profileId: id, dayId: 'd4', star: 2 }], 10_000)
    const finished = await db.weeks.get(week.id)
    const session = (await db.sessions.toArray()).find((s) => s.startedAt === 10_000)
    expect(finished?.completedAt).toBe(session?.endedAt)
  })
})

describe('Start Week', () => {
  it('proposes TMs from the 1+ sets and holds skipped lifts', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await doWorkout(db, [{ profileId: id, dayId: 'd1', star: 4, startWeight: 135 }], 1000)
    await doWorkout(db, [{ profileId: id, dayId: 'd2', star: 6 }], 2000)

    const review = await loadWeekReview(id, db)
    const byLift = Object.fromEntries(review!.proposals.map((p) => [p.exerciseId, p]))
    expect(byLift['bench-press']).toMatchObject({ proposed: 230, reason: 'progression', reps: 4 })
    expect(byLift['squat']).toMatchObject({ proposed: 290, reason: 'progression', reps: 6 })
    expect(byLift['overhead-press']).toMatchObject({ proposed: 135, reason: 'skipped' })
    expect(byLift['deadlift']).toMatchObject({ proposed: 315, reason: 'skipped' })
  })

  it('spots a stall across weeks', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await doWorkout(db, [{ profileId: id, dayId: 'd3', star: 1 }], 1000)
    const first = await loadWeekReview(id, db)
    await startWeeks(
      [{ profileId: id, type: 'normal', tms: first!.proposals.map((p) => ({ exerciseId: p.exerciseId, lb: p.proposed, reason: 'progression' })) }],
      db,
      1500,
    )
    await doWorkout(db, [{ profileId: id, dayId: 'd3', star: 0 }], 2000)
    const ohp = (await loadWeekReview(id, db))!.proposals.find((p) => p.exerciseId === 'overhead-press')
    expect(ohp).toMatchObject({ reason: 'stall', proposed: 135, resetTo: 120 })
  })

  it('writes only the TMs that changed, ends the old week and starts the next', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const week1 = await ensureFirstWeek(id, db, 1)
    const before = await db.trainingMaxes.count()

    await startWeeks(
      [
        {
          profileId: id,
          type: 'deload',
          tms: [
            { exerciseId: 'bench-press', lb: 230, reason: 'progression' },
            { exerciseId: 'squat', lb: 275, reason: 'progression' },
          ],
        },
      ],
      db,
      500,
    )

    expect(await db.trainingMaxes.count()).toBe(before + 1)
    expect((await loadTms(id, db))['bench-press']).toBe(230)
    expect(await db.weeks.get(week1.id)).toMatchObject({ endedAt: 500, days: { d1: 'skipped', d4: 'skipped' } })
    const overview = await loadWeekOverview(id, db)
    expect(overview.week).toMatchObject({ number: 2, type: 'deload', startedAt: 500 })
    expect(overview.complete).toBe(false)
  })
})
