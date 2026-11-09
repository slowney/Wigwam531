import { describe, expect, it } from 'vitest'
import { applyAccessoryGroup, addAccessory, addToSuperset, leaveSuperset, logSet, removeAccessory, setFromPlan, startSession } from '../src/db/sessions.ts'
import { saveAccessoryGroup } from '../src/db/programs.ts'
import type { PlannedSlot } from '../src/engine/plan.ts'
import { backToBack, nextSet, setOrder } from '../src/engine/session.ts'
import { addLeader, freshDb, lifts, planFor } from './helpers.ts'

const slot = (slotId: string, sets: number): PlannedSlot => ({
  slotId,
  exerciseId: slotId,
  role: 'accessory',
  schemeId: 'range-3x8-12',
  kind: 'range',
  missingTm: false,
  warmups: [],
  sets: Array.from({ length: sets }, () => ({ reps: 8, repsMax: 12, amrap: false, progression: false, tmTest: false })),
})
const done = (...keys: Array<[string, number]>) => keys.map(([slotId, index]) => ({ slotId, index, warmup: false }))

describe('superset order', () => {
  const slots = [slot('main', 2), slot('a', 3), slot('b', 2), slot('c', 1)]
  const order = (supersets: string[][]) => setOrder(slots, supersets).map((s) => `${s.slotId}${s.index}`)

  it('goes round by round from where the first exercise sits, dropping one that runs out', () => {
    expect(order([])).toEqual(['main0', 'main1', 'a0', 'a1', 'a2', 'b0', 'b1', 'c0'])
    expect(order([['a', 'b']])).toEqual(['main0', 'main1', 'a0', 'b0', 'a1', 'b1', 'a2', 'c0'])
    // The order inside a superset is the superset's, not the page's.
    expect(order([['c', 'a']])).toEqual(['main0', 'main1', 'c0', 'a0', 'a1', 'a2', 'b0', 'b1'])
  })

  it('picks the next set in that order', () => {
    expect(nextSet(slots, done(['main', 0], ['main', 1], ['a', 0]), [['a', 'b']])).toEqual({ slotId: 'b', index: 0 })
  })

  it('rests only once a round is done, main lifts finished or not', () => {
    const supersets = [['a', 'b']]
    // Nothing of the main lift logged: accessories go whenever the bar's busy.
    expect(backToBack(slots, done(['a', 0]), supersets, { slotId: 'a', index: 0 })).toBe(true)
    expect(backToBack(slots, done(['a', 0], ['b', 0]), supersets, { slotId: 'b', index: 0 })).toBe(false)
    expect(backToBack(slots, done(['a', 0], ['b', 0], ['a', 1]), supersets, { slotId: 'a', index: 1 })).toBe(true)
    // b has only two sets, so a's third is a set on its own, rest and all.
    expect(backToBack(slots, done(['a', 0], ['b', 0], ['a', 1], ['b', 1], ['a', 2]), supersets, { slotId: 'a', index: 2 })).toBe(false)
    // Out of order: b first, so a is still to come this round.
    expect(backToBack(slots, done(['b', 0]), supersets, { slotId: 'b', index: 0 })).toBe(true)
    expect(backToBack(slots, done(['main', 0]), supersets, { slotId: 'main', index: 0 })).toBe(false)
  })
})

describe('supersets in a workout', () => {
  async function workout() {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const session = await startSession([{ profileId: lead, dayId: 'd1' }], 'home', db)
    const entry = (await db.entries.where('sessionId').equals(session).first())!
    for (const id of ['face-pull', 'db-lateral-raise', 'hammer-curl', 'cable-crunch']) {
      await addAccessory(entry.id, id, { forFollowers: false }, db)
    }
    const picks = (await db.entries.get(entry.id))!.accessories.map((a) => a.id)
    return { db, lead, entryId: entry.id, picks: picks as [string, string, string, string] }
  }

  it('join, grow to three at most, and come apart', async () => {
    const { db, entryId, picks } = await workout()
    const [a, b, c, d] = picks
    await addToSuperset(entryId, a, b, db)
    await addToSuperset(entryId, c, b, db) // joins a and b's
    expect((await db.entries.get(entryId))?.supersets).toEqual([[a, b, c]])
    await expect(addToSuperset(entryId, d, a, db)).rejects.toThrow('3 exercises at most')
    await leaveSuperset(entryId, a, db)
    expect((await db.entries.get(entryId))?.supersets).toEqual([[b, c]])
    await removeAccessory(entryId, c, db)
    expect((await db.entries.get(entryId))?.supersets).toEqual([])
  })

  it('skip the rest in the middle of a round', async () => {
    const { db, lead, entryId, picks } = await workout()
    await addToSuperset(entryId, picks[0], picks[1], db)
    const entry = (await db.entries.get(entryId))!
    const face = (await planFor(db, lead, entryId)).slots.find((s) => s.slotId === picks[0])!
    await db.entries.update(entryId, { restEndsAt: 5_000, restSeconds: 90 })
    await logSet(setFromPlan(entry, face, 0, face.sets[0]!, { weight: 30, reps: 15 }), 0, db)
    expect((await db.entries.get(entryId))?.restEndsAt).toBeUndefined()
  })

  it('are saved with a group and come back with it', async () => {
    const { db, lead, entryId, picks } = await workout()
    await addToSuperset(entryId, picks[0], picks[2], db)
    const entry = (await db.entries.get(entryId))!
    await saveAccessoryGroup(lead, 'd1', {
      name: 'Pull and arms',
      items: entry.accessories.map((a) => ({ exerciseId: a.exerciseId, sets: a.sets, reps: a.reps })),
      supersets: [[0, 2]],
    }, db)

    // Next time: the same day with nothing picked yet.
    await db.entries.update(entryId, { accessories: [], supersets: [] })
    const group = (await db.programs.get(lead))!.program!.days.find((d) => d.id === 'd1')!.groups![0]!
    await applyAccessoryGroup(entryId, group, { forFollowers: false }, db)
    const after = (await db.entries.get(entryId))!
    const idOf = (exerciseId: string) => after.accessories.find((a) => a.exerciseId === exerciseId)!.id
    expect(after.supersets).toEqual([[idOf('face-pull'), idOf('hammer-curl')]])
  })
})
