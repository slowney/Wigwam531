import { describe, expect, it } from 'vitest'
import { loadTms } from '../src/db/profiles.ts'
import { endWeek, loadWeekOverview, loadWeekReview, startWeeks } from '../src/db/weeks.ts'
import { addFollower, addLeader, doWorkout, freshDb, lifts, planFor } from './helpers.ts'
import { startSession } from '../src/db/sessions.ts'

// A full week for a garage of three, start to finish, through the same code
// the screens use: two partners following the lead, one of them missing a
// day, then everyone into Week 2.
describe('a mock week for three', () => {
  it('runs from Week 1 into Week 2 with the right TMs and weights', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const a = await addFollower(db, 'A', lead, lifts(185, 225, 95, 275))
    const b = await addFollower(db, 'B', lead, lifts(195, 250, 115, 300))

    await doWorkout(
      db,
      [
        { profileId: lead, dayId: 'd1', star: 4, startWeight: 135, accessories: ['db-row'] },
        { profileId: a, dayId: 'd1', star: 2, startWeight: 95 },
        { profileId: b, dayId: 'd1', star: 6, startWeight: 115 },
      ],
      1_000,
    )
    await doWorkout(
      db,
      [
        { profileId: lead, dayId: 'd2', star: 6 },
        { profileId: a, dayId: 'd2', star: 3 },
        { profileId: b, dayId: 'd2', star: 0 },
      ],
      2_000,
    )
    // B misses Day 3.
    await doWorkout(
      db,
      [
        { profileId: lead, dayId: 'd3', star: 3 },
        { profileId: a, dayId: 'd3', star: 1 },
      ],
      3_000,
    )
    await doWorkout(
      db,
      [
        { profileId: lead, dayId: 'd4', star: 2 },
        { profileId: a, dayId: 'd4', star: 7 },
        { profileId: b, dayId: 'd4', star: 4 },
      ],
      4_000,
    )

    // The lead's accessory went to both followers.
    const day1Entries = (await db.entries.toArray()).filter((e) => e.dayId === 'd1')
    expect(day1Entries.map((e) => e.accessories.map((x) => x.exerciseId))).toEqual([['db-row'], ['db-row'], ['db-row']])

    expect((await loadWeekOverview(lead, db)).complete).toBe(true)
    expect((await loadWeekOverview(a, db)).complete).toBe(true)
    const bWeek = await loadWeekOverview(b, db)
    expect(bWeek.complete).toBe(false)
    expect(bWeek.pending.map((d) => d.id)).toEqual(['d3'])
    await endWeek(bWeek.week!.id, db, 4_500)

    const starts = []
    for (const profileId of [lead, a, b]) {
      const review = (await loadWeekReview(profileId, db))!
      starts.push({
        profileId,
        type: 'normal' as const,
        tms: review.proposals.map((p) => ({ exerciseId: p.exerciseId, lb: p.proposed, reason: 'progression' as const })),
      })
    }
    await startWeeks(starts, db, 5_000)

    // Upper lifts +5 for 2-5 reps, +10 for 6+; lower +5 / +10 / +15.
    expect(await loadTms(lead, db)).toEqual(lifts(230, 290, 140, 320))
    expect(await loadTms(a, db)).toEqual(lifts(190, 230, 95, 290))
    // B skipped Day 3, so OHP holds; 0 on the squat 1+ set adds nothing.
    expect(await loadTms(b, db)).toEqual(lifts(205, 250, 115, 310))

    // Week 2, Day 1 for the lead: the bench runs off the new TM, and the
    // heavy row moves up after all four sets hit 8 last week.
    const session = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db, 6_000)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    const { slots } = await planFor(db, lead, entry.id)
    const bench = slots.find((s) => s.slotId === 'd1-t1')!
    const row = slots.find((s) => s.slotId === 'd1-t3')!
    expect(bench.sets.find((s) => s.progression)?.weight).toBe(220) // 95% of 230 = 218.5
    expect(row.sets.map((s) => s.weight)).toEqual([140, 140, 140, 140])
    expect((await loadWeekOverview(lead, db)).week?.number).toBe(2)
  })
})
