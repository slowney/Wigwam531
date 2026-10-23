import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../src/data/exercises.ts'
import { NSUNS_4DAY_ROW } from '../src/data/presets.ts'
import { presetRatings } from '../src/data/ratingPresets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { openDb, type WigwamDb } from '../src/db/db.ts'
import {
  addBodyweight,
  archiveProfile,
  createProfile,
  deleteBodyweight,
  loadBodyweights,
  loadProgram,
  loadTms,
  setTm,
  type NewProfile,
} from '../src/db/profiles.ts'
import { requiredTms, type Program } from '../src/engine/program.ts'

let dbCount = 0
const freshDb = () => openDb(`profiles-test-${dbCount++}`)

// Made-up numbers; the repo is public.
const TMS = { 'bench-press': 225, squat: 275, 'overhead-press': 135, deadlift: 315 }

const leader = (overrides: Partial<NewProfile> = {}): NewProfile => ({
  name: 'Lead',
  color: '#f2a33a',
  program: { kind: 'preset', presetId: 'nsuns-4day-row' },
  tms: TMS,
  ratingPreset: 'dumbbell-first',
  ...overrides,
})

const follower = (leaderId: string): NewProfile => ({
  name: 'Partner',
  color: '#3cc1b0',
  program: { kind: 'follow', leaderId },
  tms: { 'bench-press': 185, squat: 225, 'overhead-press': 95, deadlift: 275 },
  ratingPreset: 'blank',
})

const slot = (program: Program | undefined, id: string) =>
  program?.days.flatMap((d) => d.mains).find((m) => m.id === id)

async function editLeaderProgram(db: WigwamDb, leaderId: string, edit: (p: Program) => Program) {
  const row = await db.programs.get(leaderId)
  await db.programs.put({ ...row!, program: edit(row!.program!) })
}

describe('creating a profile', () => {
  it('gives a leader their own copy of the preset, their TMs and their ratings', async () => {
    const db = freshDb()
    const id = await createProfile(leader({ name: '  Lead  ' }), db, 1000)

    expect(await db.profiles.get(id)).toEqual({ id, name: 'Lead', color: '#f2a33a', createdAt: 1000, archived: false })
    const program = await loadProgram(id, db)
    expect(program).toEqual(NSUNS_4DAY_ROW)
    expect(program).not.toBe(NSUNS_4DAY_ROW)
    expect(await loadTms(id, db)).toEqual(TMS)
    expect(await db.ratings.where('profileId').equals(id).count()).toBe(
      presetRatings('dumbbell-first', EXERCISES).length,
    )
  })

  it('needs a name', async () => {
    await expect(createProfile(leader({ name: '   ' }), freshDb())).rejects.toThrow('needs a name')
  })

  it('leaves out TMs that were left blank', async () => {
    const db = freshDb()
    const id = await createProfile(leader({ tms: { 'bench-press': 225, squat: Number.NaN, deadlift: 0 } }), db)
    expect(await loadTms(id, db)).toEqual({ 'bench-press': 225 })
  })
})

describe('following', () => {
  it("runs the leader's program with the follower's own TMs", async () => {
    const db = freshDb()
    const lead = await createProfile(leader(), db)
    const partner = await createProfile(follower(lead), db)

    const program = await loadProgram(partner, db)
    expect(program).toEqual(NSUNS_4DAY_ROW)
    expect(requiredTms(program!, findScheme)).toEqual(['bench-press', 'overhead-press', 'squat', 'deadlift'])
    expect((await loadTms(partner, db))['bench-press']).toBe(185)
    expect(await db.ratings.where('profileId').equals(partner).count()).toBe(0)
  })

  it("picks up the leader's edits", async () => {
    const db = freshDb()
    const lead = await createProfile(leader(), db)
    const partner = await createProfile(follower(lead), db)
    await editLeaderProgram(db, lead, (p) => ({ ...p, name: 'Edited' }))
    expect((await loadProgram(partner, db))?.name).toBe('Edited')
  })

  it('refuses to follow a follower', async () => {
    const db = freshDb()
    const lead = await createProfile(leader(), db)
    const partner = await createProfile(follower(lead), db)
    await expect(createProfile(follower(partner), db)).rejects.toThrow('Follow the leader directly')
  })

  it("gives followers their own copy, overrides included, when the leader's archived", async () => {
    const db = freshDb()
    const lead = await createProfile(leader(), db)
    const partner = await createProfile(follower(lead), db)
    const row = await db.programs.get(partner)
    await db.programs.put({ ...row!, overrides: { slots: { 'd4-t1': { exerciseId: 'trap-bar-deadlift' } } } })

    await archiveProfile(lead, db)

    expect((await db.profiles.get(lead))?.archived).toBe(true)
    const detached = await db.programs.get(partner)
    expect(detached?.followsProfileId).toBeUndefined()
    expect(slot(detached?.program, 'd4-t1')?.exerciseId).toBe('trap-bar-deadlift')
    // Later edits to the archived leader no longer reach the partner.
    await editLeaderProgram(db, lead, (p) => ({ ...p, name: 'Edited' }))
    expect((await loadProgram(partner, db))?.name).toBe(NSUNS_4DAY_ROW.name)
  })
})

describe('TMs and bodyweight', () => {
  it('keeps TM history and treats the latest as current', async () => {
    const db = freshDb()
    const id = await createProfile(leader(), db, 1000)
    await setTm(id, 'bench-press', 230, 'manual', db, 2000)
    expect((await loadTms(id, db))['bench-press']).toBe(230)
    expect(await db.trainingMaxes.where('[profileId+exerciseId]').equals([id, 'bench-press']).count()).toBe(2)
  })

  it('rejects a TM that is not a positive number', async () => {
    const db = freshDb()
    const id = await createProfile(leader(), db)
    await expect(setTm(id, 'bench-press', 0, 'manual', db)).rejects.toThrow('positive')
  })

  it('logs bodyweight newest first and can delete a mistake', async () => {
    const db = freshDb()
    const id = await createProfile(leader(), db)
    await addBodyweight(id, 180, db, 1000)
    await addBodyweight(id, 182, db, 3000)
    await addBodyweight(id, 811, db, 2000) // fat-fingered 181
    const log = await loadBodyweights(id, db)
    expect(log.map((b) => b.lb)).toEqual([182, 811, 180])
    await deleteBodyweight(log[1]!.id, db)
    expect((await loadBodyweights(id, db)).map((b) => b.lb)).toEqual([182, 180])
  })
})
