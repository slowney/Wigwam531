import type { SchemeLookup } from './schemes.ts'
import type { ExerciseLookup, Muscle } from './types.ts'

export type Tier = 'T1' | 'T2' | 'T3'

export interface MainSlot {
  /** Stable for the life of the program; followers' overrides key on it. */
  id: string
  exerciseId: string
  tier: Tier
  schemeId: string
  /**
   * Whose TM the percentages use, when it isn't the lift's own. nSuns T2s
   * borrow: incline runs off the bench TM, sumo off the deadlift TM.
   */
  tmExerciseId?: string
  warmups: boolean
}

export type AccessorySlot =
  | { id: string; kind: 'flex' }
  | { id: string; kind: 'pinned'; exerciseId: string }

/**
 * Accessories that go together, saved on a program day and offered there
 * as a set, with their own sets and reps. Followers get the leader's.
 */
export interface AccessoryGroup {
  /** Workouts that used it point at this. */
  id: string
  name: string
  items: Array<{ exerciseId: string; sets: number; reps: [number, number] }>
}

/**
 * What a day's accessories lean toward. Upper: everything above the waist.
 * Lower: legs and abs. Posterior: the hinge muscles plus pulling, to even
 * out push-heavy upper days. Full: no lean.
 */
export type DayFocus = 'upper' | 'lower' | 'posterior' | 'full'

export interface ProgramDay {
  id: string
  name: string
  mains: MainSlot[]
  accessories: AccessorySlot[]
  groups?: AccessoryGroup[]
  /** Set by hand; otherwise worked out from the day's first main lift (see dayFocus). */
  focus?: DayFocus
}

export const DAY_FOCUS_MUSCLES: Record<Exclude<DayFocus, 'full'>, readonly Muscle[]> = {
  upper: ['chest', 'frontDelts', 'sideDelts', 'rearDelts', 'lats', 'upperBack', 'biceps', 'triceps', 'forearms'],
  lower: ['quads', 'glutes', 'hamstrings', 'adductors', 'calves', 'abs'],
  posterior: ['hamstrings', 'glutes', 'lowerBack', 'lats', 'upperBack', 'rearDelts', 'biceps'],
}

/**
 * A day's accessory focus: the one set by hand, or its first main lift's.
 * A squat or lunge makes a Lower day, a deadlift or other hinge a Posterior
 * day, an upper-body lift an Upper day. No main lift, no lean.
 */
export function dayFocus(day: ProgramDay, lookup: ExerciseLookup): DayFocus {
  if (day.focus) return day.focus
  const first = day.mains[0] && lookup(day.mains[0].exerciseId)
  if (!first) return 'full'
  if (first.pattern === 'hinge') return 'posterior'
  if (first.region === 'upper') return 'upper'
  return first.region === 'lower' ? 'lower' : 'full'
}

export const DAY_FOCUS_LABELS: Record<DayFocus, string> = {
  upper: 'Upper',
  lower: 'Lower',
  posterior: 'Posterior',
  full: 'Full body',
}

/** The muscles a focus leans toward. Undefined for Full: every muscle fits. */
export function focusMuscles(focus: DayFocus): ReadonlySet<Muscle> | undefined {
  return focus === 'full' ? undefined : new Set(DAY_FOCUS_MUSCLES[focus])
}

export interface Program {
  id: string
  name: string
  days: ProgramDay[]
}

/**
 * What a follower changes about the leader's program. Only the fields that
 * differ are stored, so the leader's later edits to anything else still
 * flow through.
 */
export interface ProgramOverrides {
  slots: Record<string, Partial<Omit<MainSlot, 'id'>>>
}

export function slotTmId(slot: MainSlot): string {
  return slot.tmExerciseId ?? slot.exerciseId
}

/** "Day 2: Squat/Sumo": the day's name plus its main lifts. */
export function dayLabel(day: ProgramDay, lookup: ExerciseLookup): string {
  const lifts = day.mains.map((slot) => {
    const exercise = lookup(slot.exerciseId)
    return exercise?.short ?? exercise?.name ?? slot.exerciseId
  })
  // 5/3/1 days run the main lift twice (main work, then BBB or BBS): name it once.
  const names = [...new Set(lifts)]
  return names.length ? `${day.name}: ${names.join('/')}` : day.name
}

/**
 * The TMs a program needs, in the order they first come up. Rep-range
 * slots (the heavy row) run off a working weight instead, so they don't
 * appear; neither do T2s that borrow another lift's TM.
 */
export function requiredTms(program: Program, schemes: SchemeLookup): string[] {
  const ids: string[] = []
  for (const day of program.days) {
    for (const slot of day.mains) {
      if (schemes(slot.schemeId)?.kind !== 'percent') continue
      const id = slotTmId(slot)
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

/**
 * The TMs a program moves at Start Week: those with a ★ set on them
 * somewhere. A TM only ever borrowed by other slots isn't one of them.
 */
export function progressedTms(program: Program, schemes: SchemeLookup): string[] {
  const ids: string[] = []
  for (const day of program.days) {
    for (const slot of day.mains) {
      const scheme = schemes(slot.schemeId)
      if (scheme?.kind !== 'percent' || !scheme.sets.some((s) => s.progression)) continue
      const id = slotTmId(slot)
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

/**
 * A follower's effective program: the leader's, with their overrides laid
 * on top. Overrides for slots the leader has since deleted are ignored
 * rather than resurrected.
 */
export function resolveProgram(base: Program, overrides?: ProgramOverrides): Program {
  if (!overrides) return base
  return {
    ...base,
    days: base.days.map((day) => ({
      ...day,
      mains: day.mains.map((slot) => ({ ...slot, ...overrides.slots[slot.id], id: slot.id })),
    })),
  }
}
