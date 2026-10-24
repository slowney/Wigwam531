import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { NSUNS_4DAY } from '../src/data/presets.ts'
import { loadProgram } from '../src/db/profiles.ts'
import { removeAccessoryGroup, saveAccessoryGroup } from '../src/db/programs.ts'
import { addAccessory, applyAccessoryGroup, rateEntry, startSession } from '../src/db/sessions.ts'
import { rankGroups } from '../src/engine/groups.ts'
import { addGroup, cloneProgram } from '../src/engine/programEdit.ts'
import type { Gap } from '../src/engine/suggest.ts'
import { addFollower, addLeader, freshDb, lifts } from './helpers.ts'

const back = { name: 'Back & biceps', items: [
  { exerciseId: 'db-row', sets: 3, reps: [6, 10] as [number, number] },
  { exerciseId: 'hammer-curl', sets: 3, reps: [8, 12] as [number, number] },
] }
const arms = { name: 'Arms', items: [{ exerciseId: 'triceps-pushdown', sets: 3, reps: [10, 15] as [number, number] }] }

describe('accessory groups in a program', () => {
  it('live on a day, need a name, and copy with fresh ids', () => {
    let n = 0
    const newId = () => `g${++n}`
    const program = addGroup(NSUNS_4DAY, 'd1', back, newId)
    expect(program.days[0]!.groups).toMatchObject([{ id: 'g1', name: 'Back & biceps' }])
    expect(() => addGroup(NSUNS_4DAY, 'd1', { ...back, name: ' ' }, newId)).toThrow('name')
    expect(cloneProgram(program, 'Copy', newId).days[0]!.groups![0]!.id).not.toBe('g1')
  })
})

describe('ranking groups', () => {
  const groups = [
    { id: 'a', ...back },
    { id: 'b', ...arms },
    { id: 'c', name: 'New one', items: arms.items },
  ]
  const gap = (muscle: string): Gap => ({ muscle, have: 0, target: 10, gap: 10, kind: 'target', focused: false }) as Gap

  it('puts the best-rated first, with untried ones in the middle', () => {
    const workouts = [
      { groups: ['a'], rating: 5 },
      { groups: ['a'], rating: 4 },
      { groups: ['b'], rating: 2 },
      { groups: ['b'] },
    ]
    const ranked = rankGroups(groups, workouts, [], findExercise)
    expect(ranked.map((r) => r.group.id)).toEqual(['a', 'c', 'b'])
    expect(ranked[0]).toMatchObject({ rating: 4.5, uses: 2 })
    expect(ranked[2]).toMatchObject({ rating: 2, uses: 2 })
  })

  it('nudges up groups that work muscles behind this week', () => {
    const ranked = rankGroups(groups.slice(0, 2), [], [gap('biceps'), gap('lats')], findExercise)
    expect(ranked[0]!.group.id).toBe('a')
    expect(ranked[0]!.hits).toEqual(expect.arrayContaining(['biceps']))
    expect(ranked[1]!.hits).toEqual([])
  })
})

describe('accessory groups in a workout', () => {
  it("are saved to the leader's day, even by a follower, and shared with followers when used", async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const partner = await addFollower(db, 'Partner', lead, lifts(185, 225, 95, 275))
    const id = await saveAccessoryGroup(partner, 'd1', back, db)
    expect((await loadProgram(lead, db))!.days[0]!.groups![0]!.id).toBe(id)
    expect((await loadProgram(partner, db))!.days[0]!.groups![0]!.name).toBe('Back & biceps')

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
    await addAccessory(mine.id, 'db-row', { forFollowers: false }, db)
    const group = (await loadProgram(lead, db))!.days[0]!.groups![0]!
    await applyAccessoryGroup(mine.id, group, { forFollowers: true }, db)
    const after = await db.entries.where('sessionId').equals(session).toArray()
    for (const e of after) {
      expect(e.groups).toEqual([group.id])
      // Already-picked exercises aren't added twice.
      expect(e.accessories.filter((a) => a.exerciseId === 'db-row')).toHaveLength(1)
      expect(e.accessories.some((a) => a.exerciseId === 'hammer-curl')).toBe(true)
    }
    await rateEntry(mine.id, 5, db)
    const rated = (await db.entries.get(mine.id))!
    expect(rankGroups([group], [rated], [], findExercise)[0]!.rating).toBe(5)

    await removeAccessoryGroup(partner, group.id, db)
    expect((await loadProgram(lead, db))!.days[0]!.groups).toEqual([])
  })
})
