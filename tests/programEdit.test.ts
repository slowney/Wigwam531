import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import { NSUNS_4DAY, NSUNS_4DAY_ROW } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { resolveProgram, type Program } from '../src/engine/program.ts'
import {
  addDay,
  addMainSlot,
  addPinned,
  blankProgram,
  changeExercise,
  clearOverride,
  cloneProgram,
  moveDay,
  moveMainSlot,
  newMainSlot,
  overrideDiff,
  permanentSwap,
  removeAccessorySlot,
  removeDay,
  removeMainSlot,
  renameDay,
  setFlexSlots,
  setOverride,
  updateMainSlot,
} from '../src/engine/programEdit.ts'

/** Predictable ids: id-1, id-2, ... */
function ids() {
  let n = 0
  return () => `id-${++n}`
}

const names = (p: Program) => p.days.map((d) => d.name)
const allIds = (p: Program) => [
  p.id,
  ...p.days.flatMap((d) => [d.id, ...d.mains.map((m) => m.id), ...d.accessories.map((a) => a.id)]),
]

describe('building a program', () => {
  it('starts from scratch with empty days and three open slots each', () => {
    const p = blankProgram('  My 3-day ', 3, ids())
    expect(p.name).toBe('My 3-day')
    expect(names(p)).toEqual(['Day 1', 'Day 2', 'Day 3'])
    expect(p.days.every((d) => d.mains.length === 0 && d.accessories.length === 3)).toBe(true)
  })

  it('clones with fresh ids everywhere', () => {
    const copy = cloneProgram(NSUNS_4DAY_ROW, 'Mine', ids())
    expect(copy.name).toBe('Mine')
    expect(new Set(allIds(copy)).size).toBe(allIds(copy).length)
    expect(allIds(copy).some((id) => allIds(NSUNS_4DAY_ROW).includes(id))).toBe(false)
    expect(copy.days[0]!.mains.map((m) => m.exerciseId)).toEqual(['bench-press', 'overhead-press', 'barbell-row'])
  })
})

describe('days', () => {
  it('can be added empty or as a copy, and are named by position', () => {
    const newId = ids()
    const five = addDay(addDay(NSUNS_4DAY, newId, 'd1'), newId)
    expect(names(five)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6'])
    expect(five.days[4]!.mains.map((m) => m.exerciseId)).toEqual(['bench-press', 'overhead-press'])
    expect(five.days[4]!.mains[0]!.id).not.toBe('d1-t1')
    expect(five.days[5]!.mains).toEqual([])
  })

  it('renumber when moved or removed, unless renamed by hand', () => {
    const renamed = renameDay(NSUNS_4DAY, 'd2', 'Leg day')
    const moved = moveDay(renamed, 'd4', -1)
    expect(names(moved)).toEqual(['Day 1', 'Leg day', 'Day 3', 'Day 4'])
    expect(moved.days.map((d) => d.id)).toEqual(['d1', 'd2', 'd4', 'd3'])
    expect(names(removeDay(moved, 'd1'))).toEqual(['Leg day', 'Day 2', 'Day 3'])
  })

  it('go back to their default name when renamed to nothing', () => {
    expect(renameDay(renameDay(NSUNS_4DAY, 'd3', 'Press'), 'd3', '  ').days[2]!.name).toBe('Day 3')
  })

  it("can't drop below one", () => {
    expect(() => removeDay(blankProgram('x', 1, ids()), 'id-2')).toThrow('at least one day')
  })
})

describe('main lifts', () => {
  const row = { exerciseId: 'barbell-row', tier: 'T3' as const, schemeId: 'range-4x6-8', warmups: false }

  it('can be added up to three a day', () => {
    const newId = ids()
    const three = addMainSlot(NSUNS_4DAY, 'd3', row, newId)
    expect(three.days[2]!.mains.map((m) => m.exerciseId)).toEqual(['overhead-press', 'incline-bench-press', 'barbell-row'])
    expect(() => addMainSlot(three, 'd3', row, newId)).toThrow('up to 3')
  })

  it('can be changed, reordered and removed', () => {
    const changed = updateMainSlot(NSUNS_4DAY, 'd4-t2', { exerciseId: 'trap-bar-deadlift', tmExerciseId: 'deadlift' })
    expect(changed.days[3]!.mains[1]).toMatchObject({ id: 'd4-t2', exerciseId: 'trap-bar-deadlift', tier: 'T2' })
    const swapped = moveMainSlot(changed, 'd4-t2', -1)
    expect(swapped.days[3]!.mains.map((m) => m.id)).toEqual(['d4-t2', 'd4-t1'])
    expect(removeMainSlot(swapped, 'd4-t1').days[3]!.mains.map((m) => m.id)).toEqual(['d4-t2'])
  })
})

describe('accessory slots', () => {
  it('set the number of open slots, keeping pinned ones', () => {
    const newId = ids()
    const pinned = addPinned(NSUNS_4DAY, 'd1', 'face-pull', newId)
    const two = setFlexSlots(pinned, 'd1', 2, newId)
    expect(two.days[0]!.accessories.map((a) => a.kind)).toEqual(['pinned', 'flex', 'flex'])
    const five = setFlexSlots(two, 'd1', 5, newId)
    expect(five.days[0]!.accessories.filter((a) => a.kind === 'flex')).toHaveLength(5)
  })

  it('pin an exercise once, and unpin it', () => {
    const newId = ids()
    const once = addPinned(addPinned(NSUNS_4DAY, 'd1', 'face-pull', newId), 'd1', 'face-pull', newId)
    const pins = once.days[0]!.accessories.filter((a) => a.kind === 'pinned')
    expect(pins).toHaveLength(1)
    expect(removeAccessorySlot(once, pins[0]!.id).days[0]!.accessories.some((a) => a.kind === 'pinned')).toBe(false)
  })
})

describe('making a swap permanent', () => {
  it("runs a lift with no TM of its own at its usual rep range", () => {
    const slot = permanentSwap(NSUNS_4DAY, 'd2-t1', 'front-squat', () => false, findExercise)
    expect(slot).toMatchObject({ id: 'd2-t1', exerciseId: 'front-squat', schemeId: 'range-3x5-8', warmups: false })
  })

  it('writes "its own TM" out, so it survives a backup', () => {
    const slot = permanentSwap(NSUNS_4DAY, 'd2-t2', 'trap-bar-deadlift', () => true, findExercise)
    expect(slot).toMatchObject({ exerciseId: 'trap-bar-deadlift', tmExerciseId: 'trap-bar-deadlift', schemeId: 'nsuns-t2-sumo' })
    expect(JSON.parse(JSON.stringify(slot)).tmExerciseId).toBe('trap-bar-deadlift')
  })
})

describe("a follower's changes", () => {
  it('layer over the leader and can be undone one slot at a time', () => {
    let o = setOverride(undefined, 'd4-t1', { exerciseId: 'trap-bar-deadlift' })
    o = setOverride(o, 'd4-t1', { warmups: false })
    o = setOverride(o, 'd1-t2', { schemeId: 'range-3x8-12' })
    const mine = resolveProgram(NSUNS_4DAY, o)
    expect(mine.days[3]!.mains[0]).toMatchObject({ exerciseId: 'trap-bar-deadlift', warmups: false })
    expect(resolveProgram(NSUNS_4DAY, clearOverride(o, 'd4-t1')).days[3]!.mains[0]!.exerciseId).toBe('deadlift')
  })
})

describe('adding and changing lifts', () => {
  const tms = new Set(['bench-press', 'squat', 'overhead-press', 'deadlift'])
  const hasTm = (id: string) => tms.has(id)

  it("start nSuns' own lifts the way nSuns runs them", () => {
    expect(newMainSlot('bench-press', 'T1', hasTm, findExercise)).toEqual({
      exerciseId: 'bench-press',
      tier: 'T1',
      schemeId: 'nsuns-t1-bench',
      warmups: true,
    })
    expect(newMainSlot('incline-bench-press', 'T2', hasTm, findExercise)).toMatchObject({
      schemeId: 'nsuns-t2-incline',
      tmExerciseId: 'bench-press',
      warmups: false,
    })
  })

  it('start anything else on a TM shape if it has a TM, or its rep range if not', () => {
    expect(newMainSlot('squat', 'T2', hasTm, findExercise)).toMatchObject({ schemeId: 'nsuns-t2-ohp' })
    expect(newMainSlot('barbell-row', 'T3', hasTm, findExercise)).toMatchObject({ schemeId: 'range-4x6-8', warmups: false })
    expect(newMainSlot('db-row', 'T1', hasTm, findExercise).schemeId).toMatch(/^range-/)
  })

  it('keep a percent slot on a TM when the lift changes', () => {
    const incline = NSUNS_4DAY.days[2]!.mains[1]!
    expect(changeExercise(incline, 'close-grip-bench-press', hasTm, findScheme)).toMatchObject({
      exerciseId: 'close-grip-bench-press',
      tmExerciseId: 'bench-press',
    })
    const bench = NSUNS_4DAY.days[0]!.mains[0]!
    expect(changeExercise(bench, 'close-grip-bench-press', hasTm, findScheme).tmExerciseId).toBe('bench-press')
    expect(changeExercise(incline, 'overhead-press', hasTm, findScheme).tmExerciseId).toBeUndefined()
    const row = NSUNS_4DAY_ROW.days[0]!.mains[2]!
    expect(changeExercise(row, 'pendlay-row', hasTm, findScheme)).toEqual({ ...row, exerciseId: 'pendlay-row' })
  })

  it("keep only what a follower actually changed, with the TM spelled out when it's theirs", () => {
    const sumo = NSUNS_4DAY.days[1]!.mains[1]!
    expect(overrideDiff(sumo, { ...sumo })).toEqual({})
    expect(overrideDiff(sumo, { ...sumo, warmups: true })).toEqual({ warmups: true })
    expect(overrideDiff(sumo, { ...sumo, exerciseId: 'trap-bar-deadlift', tmExerciseId: undefined })).toEqual({
      exerciseId: 'trap-bar-deadlift',
      tmExerciseId: 'trap-bar-deadlift',
    })
    expect(overrideDiff(sumo, { ...sumo, tmExerciseId: undefined })).toEqual({ tmExerciseId: 'sumo-deadlift' })
  })
})
