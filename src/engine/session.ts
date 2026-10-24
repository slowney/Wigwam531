// Rules for one workout: today's swaps, which set is next, who lifts next on
// a shared bar, how long to rest, carried-over working weights, and PRs.
import {
  planAccessory,
  planDay,
  type AccessoryPick,
  type PlanContext,
  type PlannedDay,
  type PlannedSlot,
  type WeekType,
} from './plan.ts'
import type { Program, ProgramDay } from './program.ts'
import { nextWorkingWeight, type DoubleProgression, type RangeRule } from './progression.ts'
import { checkPr, type PrCheck } from './records.ts'
import { rangeSchemeId, type SchemeLookup } from './schemes.ts'
import type { ExerciseLookup, Gym } from './types.ts'
import { gymChecks, nextLoad } from './weights.ts'

/** Today-only swaps: main slot id → the exercise done instead. */
export type Swaps = Readonly<Record<string, string>>

/**
 * A swapped-in lift with a TM of its own keeps the slot's scheme, and its 1+
 * set then moves its own TM. One without a TM runs its usual rep range at a
 * weight the lifter picks. Either way the original lift logs nothing, so its
 * TM holds this week.
 */
export function applySwaps(
  day: ProgramDay,
  swaps: Swaps,
  hasTm: (exerciseId: string) => boolean,
  lookup: ExerciseLookup,
): ProgramDay {
  return {
    ...day,
    mains: day.mains.map((slot) => {
      const exerciseId = swaps[slot.id]
      if (!exerciseId || exerciseId === slot.exerciseId) return slot
      if (hasTm(exerciseId)) return { ...slot, exerciseId, tmExerciseId: undefined }
      const exercise = lookup(exerciseId)
      return {
        id: slot.id,
        exerciseId,
        tier: slot.tier,
        schemeId: rangeSchemeId(exercise?.sets ?? 3, exercise?.reps ?? [8, 12]),
        warmups: false,
      }
    }),
  }
}

/** Where a logged set sits in the plan. */
export interface SetRef {
  slotId: string
  index: number
  warmup: boolean
}

const key = (slotId: string, index: number) => `${slotId}#${index}`

function doneKeys(logged: ReadonlyArray<SetRef>): Set<string> {
  return new Set(logged.filter((s) => !s.warmup).map((s) => key(s.slotId, s.index)))
}

/** The first planned working set with nothing logged against it. Warm-ups never block it. */
export function nextSet(
  slots: ReadonlyArray<PlannedSlot>,
  logged: ReadonlyArray<SetRef>,
): { slotId: string; index: number } | undefined {
  const done = doneKeys(logged)
  for (const slot of slots) {
    for (let i = 0; i < slot.sets.length; i++) {
      if (!done.has(key(slot.slotId, i)) && !slot.sets[i]!.skipped) return { slotId: slot.slotId, index: i }
    }
  }
  return undefined
}

export function dayProgress(
  slots: ReadonlyArray<PlannedSlot>,
  logged: ReadonlyArray<SetRef>,
): { done: number; total: number } {
  const done = doneKeys(logged)
  let count = 0
  let total = 0
  for (const slot of slots) {
    for (let i = 0; i < slot.sets.length; i++) {
      if (slot.sets[i]!.skipped && !done.has(key(slot.slotId, i))) continue
      total++
      if (done.has(key(slot.slotId, i))) count++
    }
  }
  return { done: count, total }
}

/**
 * A finished exercise folds itself away so the next one is in view. Once a
 * slot has been folded or opened by hand, that choice sticks.
 */
export function slotCollapsed(choice: boolean | undefined, progress: { done: number; total: number }): boolean {
  return choice ?? (progress.total > 0 && progress.done >= progress.total)
}

export const REST_SECONDS = { heavy: 180, main: 120, accessory: 90 } as const

/**
 * Singles, doubles and triples at 80% of TM or more get the long rest. A T2
 * triple at 70% is the easiest set of its slot, so the percentage matters as
 * much as the reps.
 */
export function restSeconds(set: { reps: number; pct?: number }, role: 'main' | 'accessory'): number {
  if (role === 'accessory') return REST_SECONDS.accessory
  return set.reps <= 3 && (set.pct ?? 100) >= 80 ? REST_SECONDS.heavy : REST_SECONDS.main
}

/** Who's up next on a shared bar: the next person in tab order with sets left. */
export function nextLifter(
  order: ReadonlyArray<string>,
  current: string,
  hasSetsLeft: (profileId: string) => boolean,
): string {
  const start = order.indexOf(current)
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(start + step) % order.length]
    if (candidate !== undefined && hasSetsLeft(candidate)) return candidate
  }
  return current
}

interface HistorySet {
  id: string
  exerciseId: string
  sessionId: string
  weight: number
  reps: number
  warmup: boolean
  at: number
}

/** Working sets from the most recent earlier session that did this exercise. */
export function lastSessionSets<S extends HistorySet>(
  history: ReadonlyArray<S>,
  exerciseId: string,
  excludeSessionId?: string,
): S[] {
  const sets = history.filter((s) => s.exerciseId === exerciseId && !s.warmup && s.sessionId !== excludeSessionId)
  if (sets.length === 0) return []
  const latest = sets.reduce((a, b) => (b.at > a.at ? b : a))
  return sets.filter((s) => s.sessionId === latest.sessionId).sort((a, b) => a.at - b.at)
}

/** Notes left on an exercise the last time it was done, to read before doing it again. */
export function lastNotes<S extends HistorySet & { note?: string }>(
  history: ReadonlyArray<S>,
  exerciseId: string,
  excludeSessionId?: string,
): { at: number; notes: string[] } | undefined {
  const sets = lastSessionSets(history, exerciseId, excludeSessionId)
  const notes = [...new Set(sets.flatMap((s) => (s.note?.trim() ? [s.note.trim()] : [])))]
  return notes.length ? { at: sets[0]!.at, notes } : undefined
}

/** Today's double-progression weight for a rep-range slot, from the last session that did it. */
export function workingWeight(
  history: ReadonlyArray<HistorySet>,
  exerciseId: string,
  scheme: { sets: number; reps: [number, number] },
  next: (weight: number) => number | undefined,
  excludeSessionId?: string,
  rule: RangeRule = 'every',
): DoubleProgression {
  return nextWorkingWeight(lastSessionSets(history, exerciseId, excludeSessionId), scheme.reps, scheme.sets, next, rule)
}

export interface EntryPlanInput {
  program: Program
  dayId: string
  swaps: Swaps
  accessories: ReadonlyArray<AccessoryPick>
  /** Sets left out today, by slot id: set indexes. */
  skips?: Readonly<Record<string, readonly number[]>>
  weekType: WeekType
  tms: Readonly<Record<string, number>>
  /** This person's logged sets, for carried-over weights. */
  history: ReadonlyArray<HistorySet>
  /** Today's session, left out when looking for "last time". */
  sessionId: string
  gym: Gym
  lookup: ExerciseLookup
  schemes: SchemeLookup
}

/** One person's plan for today: their day with swaps applied, then their accessories. */
export function planEntry(input: EntryPlanInput): { day: PlannedDay; slots: PlannedSlot[] } | undefined {
  const programDay = input.program.days.find((d) => d.id === input.dayId)
  if (!programDay) return undefined
  const day = applySwaps(programDay, input.swaps, (id) => input.tms[id] !== undefined, input.lookup)

  // Rep-range main lifts (the heavy row) need every set at the top of the
  // range to move up; accessories need one.
  const ranges = [
    ...day.mains.flatMap((slot) => {
      const scheme = input.schemes(slot.schemeId)
      return scheme?.kind === 'range' ? [{ slotId: slot.id, exerciseId: slot.exerciseId, scheme, rule: 'every' as const }] : []
    }),
    ...input.accessories.map((pick) => ({ slotId: pick.id, exerciseId: pick.exerciseId, scheme: pick, rule: 'any' as const })),
  ]
  const progressions = new Map<string, DoubleProgression>()
  const workingWeights: Record<string, number> = {}
  for (const { slotId, exerciseId, scheme, rule } of ranges) {
    const load = input.lookup(exerciseId)?.load ?? 'barbell'
    const progression = workingWeight(
      input.history,
      exerciseId,
      scheme,
      (w) => nextLoad(w, load, input.gym),
      input.sessionId,
      rule,
    )
    progressions.set(slotId, progression)
    if (progression.weight !== undefined) workingWeights[exerciseId] = progression.weight
  }

  const ctx: PlanContext = {
    weekType: input.weekType,
    tms: input.tms,
    workingWeights,
    schemes: input.schemes,
    ...gymChecks(input.gym, input.lookup),
  }
  const withCarried = (slot: PlannedSlot): PlannedSlot => {
    const carried = progressions.get(slot.slotId)
    const skips = input.skips?.[slot.slotId]
    const sets = skips?.length ? slot.sets.map((s, i) => (skips.includes(i) ? { ...s, skipped: true } : s)) : slot.sets
    return { ...slot, sets, ...(carried ? { carried } : {}) }
  }
  const planned = planDay(day, ctx)
  const mains = planned.mains.map(withCarried)
  return {
    day: { ...planned, mains },
    slots: [...mains, ...input.accessories.map((pick) => withCarried(planAccessory(pick, ctx)))],
  }
}

/**
 * Every working set checked against earlier sessions, by exercise. Sets in
 * the same session aren't compared with each other: an nSuns pyramid climbs
 * toward its 1+ set, so the second set would always "beat" the first.
 */
export function prChecks(history: ReadonlyArray<HistorySet>): Map<string, PrCheck> {
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  const sessions = new Map<string, HistorySet[]>()
  for (const s of history) push(sessions, s.sessionId, s)
  const started = (sets: HistorySet[]) => sets.reduce((min, s) => Math.min(min, s.at), Infinity)
  const ordered = [...sessions.values()].sort((a, b) => started(a) - started(b))

  const before = new Map<string, HistorySet[]>()
  const out = new Map<string, PrCheck>()
  for (const sets of ordered) {
    for (const s of sets) if (!s.warmup) out.set(s.id, checkPr(s, before.get(s.exerciseId) ?? []))
    for (const s of sets) push(before, s.exerciseId, s)
  }
  return out
}

export type PrKind = 'e1rm' | 'reps' | 'heaviest'

/** The one label worth showing for a set, most meaningful first. */
export function prKind(check: PrCheck | undefined): PrKind | undefined {
  if (!check || check.firstTime) return undefined
  if (check.e1rmPr) return 'e1rm'
  if (check.repPr) return 'reps'
  if (check.heaviest) return 'heaviest'
  return undefined
}
