// Program edits as pure functions: each takes a program and returns a new
// one. Ids for new days and slots come from the caller, so this stays
// testable; they're never reused, because followers' overrides and logged
// sets point at them.
import { applySwaps } from './session.ts'
import {
  slotTmId,
  type AccessoryGroup,
  type AccessorySlot,
  type MainSlot,
  type Program,
  type ProgramDay,
  type ProgramOverrides,
  type Tier,
} from './program.ts'
import { rangeSchemeId, type SchemeLookup } from './schemes.ts'
import type { ExerciseLookup } from './types.ts'

export type SlotFields = Omit<MainSlot, 'id'>

export type IdMaker = () => string

export const MAX_MAINS = 3
export const MAX_DAYS = 7
export const MAX_FLEX = 6
export const DEFAULT_FLEX = 3

const DEFAULT_DAY_NAME = /^Day \d+$/

function flex(count: number, newId: IdMaker): AccessorySlot[] {
  return Array.from({ length: count }, () => ({ id: newId(), kind: 'flex' as const }))
}

function emptyDay(name: string, newId: IdMaker): ProgramDay {
  return { id: newId(), name, mains: [], accessories: flex(DEFAULT_FLEX, newId) }
}

/** Default-named days follow their position; a day renamed by hand keeps its name. */
export function renumberDays(program: Program): Program {
  return {
    ...program,
    days: program.days.map((d, i) => (DEFAULT_DAY_NAME.test(d.name) ? { ...d, name: `Day ${i + 1}` } : d)),
  }
}

/** A program to build from scratch: empty days with the usual open accessory slots. */
export function blankProgram(name: string, days: number, newId: IdMaker): Program {
  const count = Math.min(MAX_DAYS, Math.max(1, Math.round(days)))
  return {
    id: newId(),
    name: name.trim() || 'My program',
    days: Array.from({ length: count }, (_, i) => emptyDay(`Day ${i + 1}`, newId)),
  }
}

/**
 * A copy with fresh ids throughout. Used whenever a program is applied to a
 * profile, so a switch mid-week can't inherit the old days' done/skipped
 * statuses through a shared day id.
 */
export function cloneProgram(program: Program, name: string, newId: IdMaker): Program {
  return {
    id: newId(),
    name,
    days: program.days.map((d) => ({
      ...d,
      id: newId(),
      mains: d.mains.map((m) => ({ ...m, id: newId() })),
      accessories: d.accessories.map((a) => ({ ...a, id: newId() })),
      ...(d.groups ? { groups: d.groups.map((g) => ({ ...g, id: newId() })) } : {}),
    })),
  }
}

function mapDay(program: Program, dayId: string, change: (day: ProgramDay) => ProgramDay): Program {
  if (!program.days.some((d) => d.id === dayId)) throw new Error('That day is no longer in the program.')
  return { ...program, days: program.days.map((d) => (d.id === dayId ? change(d) : d)) }
}

function dayOfSlot(program: Program, slotId: string): ProgramDay {
  const day = program.days.find((d) => d.mains.some((m) => m.id === slotId) || d.accessories.some((a) => a.id === slotId))
  if (!day) throw new Error('That lift is no longer in the program.')
  return day
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta
  if (index < 0 || to < 0 || to >= list.length) return list
  const out = [...list]
  const [item] = out.splice(index, 1)
  out.splice(to, 0, item!)
  return out
}

export function renameProgram(program: Program, name: string): Program {
  return { ...program, name: name.trim() || program.name }
}

/** A new last day: a copy of `copyFrom` (with fresh ids), or empty. */
export function addDay(program: Program, newId: IdMaker, copyFrom?: string): Program {
  if (program.days.length >= MAX_DAYS) throw new Error(`A program can have up to ${MAX_DAYS} days.`)
  const source = copyFrom ? program.days.find((d) => d.id === copyFrom) : undefined
  const name = `Day ${program.days.length + 1}`
  const day: ProgramDay = source
    ? {
        id: newId(),
        name,
        mains: source.mains.map((m) => ({ ...m, id: newId() })),
        accessories: source.accessories.map((a) => ({ ...a, id: newId() })),
        ...(source.groups ? { groups: source.groups.map((g) => ({ ...g, id: newId() })) } : {}),
      }
    : emptyDay(name, newId)
  return renumberDays({ ...program, days: [...program.days, day] })
}

export function removeDay(program: Program, dayId: string): Program {
  if (program.days.length <= 1) throw new Error('A program needs at least one day.')
  return renumberDays({ ...program, days: program.days.filter((d) => d.id !== dayId) })
}

export function moveDay(program: Program, dayId: string, delta: -1 | 1): Program {
  return renumberDays({ ...program, days: move(program.days, program.days.findIndex((d) => d.id === dayId), delta) })
}

/** A blank name goes back to the day's default "Day N". */
export function renameDay(program: Program, dayId: string, name: string): Program {
  const index = program.days.findIndex((d) => d.id === dayId)
  return mapDay(program, dayId, (d) => ({ ...d, name: name.trim() || `Day ${index + 1}` }))
}

export function addMainSlot(program: Program, dayId: string, slot: SlotFields, newId: IdMaker): Program {
  return mapDay(program, dayId, (d) => {
    if (d.mains.length >= MAX_MAINS) throw new Error(`A day can have up to ${MAX_MAINS} main lifts.`)
    return { ...d, mains: [...d.mains, { ...slot, id: newId() }] }
  })
}

export function updateMainSlot(program: Program, slotId: string, changes: Partial<SlotFields>): Program {
  return mapDay(program, dayOfSlot(program, slotId).id, (d) => ({
    ...d,
    mains: d.mains.map((m) => (m.id === slotId ? { ...m, ...changes, id: m.id } : m)),
  }))
}

export function removeMainSlot(program: Program, slotId: string): Program {
  return mapDay(program, dayOfSlot(program, slotId).id, (d) => ({ ...d, mains: d.mains.filter((m) => m.id !== slotId) }))
}

export function moveMainSlot(program: Program, slotId: string, delta: -1 | 1): Program {
  return mapDay(program, dayOfSlot(program, slotId).id, (d) => ({
    ...d,
    mains: move(d.mains, d.mains.findIndex((m) => m.id === slotId), delta),
  }))
}

/** Sets how many open accessory slots a day has. Pinned ones are untouched. */
export function setFlexSlots(program: Program, dayId: string, count: number, newId: IdMaker): Program {
  const wanted = Math.min(MAX_FLEX, Math.max(0, Math.round(count)))
  return mapDay(program, dayId, (d) => {
    const pinned = d.accessories.filter((a) => a.kind === 'pinned')
    const open = d.accessories.filter((a) => a.kind === 'flex')
    const kept = open.slice(0, wanted)
    return { ...d, accessories: [...pinned, ...kept, ...flex(wanted - kept.length, newId)] }
  })
}

/** An accessory done every time this day comes around. */
export function addPinned(program: Program, dayId: string, exerciseId: string, newId: IdMaker): Program {
  return mapDay(program, dayId, (d) => {
    if (d.accessories.some((a) => a.kind === 'pinned' && a.exerciseId === exerciseId)) return d
    const pinned = d.accessories.filter((a) => a.kind === 'pinned')
    const open = d.accessories.filter((a) => a.kind === 'flex')
    return { ...d, accessories: [...pinned, { id: newId(), kind: 'pinned', exerciseId }, ...open] }
  })
}

export function removeAccessorySlot(program: Program, slotId: string): Program {
  return mapDay(program, dayOfSlot(program, slotId).id, (d) => ({
    ...d,
    accessories: d.accessories.filter((a) => a.id !== slotId),
  }))
}

/**
 * Today's swap as a permanent change to one slot, worked out the same way
 * the swap itself was. "Its own TM" is written out explicitly rather than
 * left blank: an override that only says "no TM source" would lose that in
 * a JSON backup and fall back to the leader's.
 */
export function permanentSwap(
  program: Program,
  slotId: string,
  exerciseId: string,
  hasTm: (exerciseId: string) => boolean,
  lookup: ExerciseLookup,
): MainSlot {
  const day = dayOfSlot(program, slotId)
  const swapped = applySwaps(day, { [slotId]: exerciseId }, hasTm, lookup).mains.find((m) => m.id === slotId)!
  return { ...swapped, tmExerciseId: swapped.tmExerciseId ?? swapped.exerciseId }
}

/** A follower's change to one slot, layered over whatever they'd already changed. */
export function setOverride(
  overrides: ProgramOverrides | undefined,
  slotId: string,
  changes: Partial<SlotFields>,
): ProgramOverrides {
  const slots = overrides?.slots ?? {}
  return { slots: { ...slots, [slotId]: { ...slots[slotId], ...changes } } }
}

export function clearOverride(overrides: ProgramOverrides | undefined, slotId: string): ProgramOverrides {
  const slots = { ...overrides?.slots }
  delete slots[slotId]
  return { slots }
}

// How nSuns itself runs its lifts, so one added to a day starts out the way
// the program would have it. T2s borrow a bigger lift's TM.
const NSUNS_SCHEMES: Record<string, Partial<Record<Tier, string>>> = {
  'bench-press': { T1: 'nsuns-t1-bench' },
  squat: { T1: 'nsuns-t1-squat' },
  'overhead-press': { T1: 'nsuns-t1-ohp', T2: 'nsuns-t2-ohp' },
  deadlift: { T1: 'nsuns-t1-deadlift' },
  'sumo-deadlift': { T2: 'nsuns-t2-sumo' },
  'incline-bench-press': { T2: 'nsuns-t2-incline' },
  'front-squat': { T2: 'nsuns-t2-front-squat' },
}

const NSUNS_BORROWS: Record<string, string> = {
  'sumo-deadlift': 'deadlift',
  'incline-bench-press': 'bench-press',
  'front-squat': 'squat',
}

/**
 * A first guess at a lift added to a day; all of it can be changed after.
 * nSuns' own lifts get its schemes, another lift with a TM gets the generic
 * T1 or T2 shape, and anything else starts on its rep range.
 */
export function newMainSlot(
  exerciseId: string,
  tier: Tier,
  hasTm: (exerciseId: string) => boolean,
  lookup: ExerciseLookup,
): SlotFields {
  const nsuns = NSUNS_SCHEMES[exerciseId]?.[tier]
  const borrows = NSUNS_BORROWS[exerciseId]
  if (nsuns) return { exerciseId, tier, schemeId: nsuns, ...(borrows ? { tmExerciseId: borrows } : {}), warmups: tier === 'T1' }
  if (hasTm(exerciseId) && tier !== 'T3') {
    return { exerciseId, tier, schemeId: tier === 'T1' ? 'nsuns-t1-squat' : 'nsuns-t2-ohp', warmups: tier === 'T1' }
  }
  const exercise = lookup(exerciseId)
  return { exerciseId, tier, schemeId: rangeSchemeId(exercise?.sets ?? 3, exercise?.reps ?? [8, 12]), warmups: false }
}

/**
 * A different lift in the same slot. A percent slot keeps running off a TM:
 * the new lift's own if it has one, otherwise the one the slot already used,
 * the way nSuns runs incline off the bench TM.
 */
export function changeExercise(
  slot: SlotFields,
  exerciseId: string,
  hasTm: (exerciseId: string) => boolean,
  schemes: SchemeLookup,
): SlotFields {
  if (schemes(slot.schemeId)?.kind !== 'percent') return { ...slot, exerciseId }
  return { ...slot, exerciseId, tmExerciseId: hasTm(exerciseId) ? undefined : (slot.tmExerciseId ?? slot.exerciseId) }
}

/**
 * What a follower's version of a slot changes from the leader's. Only the
 * fields that differ are kept, so the leader's later edits to the rest
 * still reach them. The TM source is written out whenever it matters, for
 * the reason given at `permanentSwap`.
 */
export function overrideDiff(leader: MainSlot, mine: SlotFields): Partial<SlotFields> {
  const diff: Partial<SlotFields> = {}
  if (mine.exerciseId !== leader.exerciseId) diff.exerciseId = mine.exerciseId
  if (mine.tier !== leader.tier) diff.tier = mine.tier
  if (mine.schemeId !== leader.schemeId) diff.schemeId = mine.schemeId
  if (mine.warmups !== leader.warmups) diff.warmups = mine.warmups
  const tm = mine.tmExerciseId ?? mine.exerciseId
  if (diff.exerciseId || tm !== slotTmId(leader)) diff.tmExerciseId = tm
  return diff
}

/** Saves accessories that went well together on a day, to offer there again. */
export function addGroup(program: Program, dayId: string, group: Omit<AccessoryGroup, 'id'>, newId: IdMaker): Program {
  const name = group.name.trim()
  if (!name) throw new Error('Give the group a name.')
  if (group.items.length === 0) throw new Error('A group needs at least one accessory.')
  return mapDay(program, dayId, (d) => ({ ...d, groups: [...(d.groups ?? []), { ...group, name, id: newId() }] }))
}

export function removeGroup(program: Program, groupId: string): Program {
  return { ...program, days: program.days.map((d) => (d.groups ? { ...d, groups: d.groups.filter((g) => g.id !== groupId) } : d)) }
}
