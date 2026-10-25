// Turns a program plus the current TMs into every prescribed set. Nothing
// here is ever saved: the plan is recalculated each time it's shown, which
// is what lets an edit to the program or a TM land mid-week.
import { slotTmId, type AccessorySlot, type MainSlot, type Program, type ProgramDay, type Tier } from './program.ts'
import type { DoubleProgression } from './progression.ts'
import {
  DELOAD_SETS,
  TM_TEST_SETS,
  rangeSchemeId,
  waveName,
  waveSets,
  type PercentScheme,
  type PercentSet,
  type RangeScheme,
  type SchemeLookup,
} from './schemes.ts'
import { DEFAULT_ROUNDING, percentOf, type Rounding } from './weights.ts'

export type WeekType = 'normal' | 'deload' | 'tmTest'

export interface PlannedSet {
  /** Undefined only for a rep-range slot with no history yet: the lifter picks. */
  weight?: number
  reps: number
  /** Top of the range, for double-progression sets. */
  repsMax?: number
  pct?: number
  amrap: boolean
  progression: boolean
  tmTest: boolean
  /** The gym's plates can't make this weight on this bar. */
  unloadable?: boolean
  /** Left out today. It doesn't count toward the day, and nothing is logged for it. */
  skipped?: boolean
}

export interface PlannedSlot {
  slotId: string
  exerciseId: string
  role: 'main' | 'accessory'
  /** Main lifts only. */
  tier?: Tier
  schemeId: string
  kind: 'percent' | 'range'
  tmExerciseId?: string
  tm?: number
  /** A percentage slot whose TM hasn't been entered yet. */
  missingTm: boolean
  warmups: PlannedSet[]
  sets: PlannedSet[]
  /** Rep-range work: how today's weight came from last time's. Set by `planEntry`. */
  carried?: DoubleProgression
  /** A wave scheme's week, as in "3s week". */
  wave?: string
}

export interface PlannedDay {
  dayId: string
  name: string
  mains: PlannedSlot[]
  accessories: AccessorySlot[]
}

export interface PlanContext {
  weekType: WeekType
  /** By exercise id. */
  tms: Readonly<Record<string, number>>
  /** Current double-progression weight, by exercise id. */
  workingWeights?: Readonly<Record<string, number>>
  /** Where this week falls in a wave (see `waveIndex`). Schemes without waves ignore it. */
  waveIndex?: number
  schemes: SchemeLookup
  rounding?: Rounding
  /** Bar weight for an exercise. Undefined for anything not on a bar. */
  barFor?: (exerciseId: string) => number | undefined
  /** Whether the gym's plates can make this weight on this exercise's bar. */
  canLoad?: (exerciseId: string, weight: number) => boolean
}

const WARMUPS = [
  { pct: 40, reps: 5 },
  { pct: 50, reps: 5 },
  { pct: 60, reps: 3 },
]

/** A warm-up this close to the first working set is just a working set. */
const WARMUP_GAP = 10

export function warmupSets(
  tm: number,
  firstWorking: number,
  bar: number | undefined,
  rounding: Rounding = DEFAULT_ROUNDING,
): PlannedSet[] {
  const out: PlannedSet[] = []
  if (bar !== undefined && firstWorking > bar) out.push(warmup(bar, 10))
  for (const w of WARMUPS) {
    const weight = percentOf(tm, w.pct, rounding)
    if (weight <= (bar ?? 0)) continue
    if (weight > firstWorking - WARMUP_GAP) continue
    if (out.some((s) => s.weight === weight)) continue
    out.push(warmup(weight, w.reps, w.pct))
  }
  return out
}

function warmup(weight: number, reps: number, pct?: number): PlannedSet {
  return { weight, reps, pct, amrap: false, progression: false, tmTest: false }
}

function percentSetsFor(scheme: PercentScheme, weekType: WeekType, waveIndex: number): PercentSet[] {
  if (weekType === 'deload') return DELOAD_SETS
  if (weekType === 'tmTest') {
    // Only the slot that drives a TM tests it. Everything else rides along
    // as deload work, so a TM-test week is light across the board.
    return scheme.sets.some((s) => s.progression) || scheme.cycle ? TM_TEST_SETS : DELOAD_SETS
  }
  return waveSets(scheme, waveIndex)
}

/**
 * Where a week falls in a wave (0 for the first week): normal weeks since
 * the last deload or TM test. Those weeks don't count, so every cycle
 * after one starts again from its first week.
 */
export function waveIndex(weeks: ReadonlyArray<{ number: number; type: WeekType }>, number: number): number {
  let count = 0
  for (const w of [...weeks].filter((x) => x.number < number).sort((a, b) => b.number - a.number)) {
    if (w.type !== 'normal') break
    count++
  }
  return count
}

function rangeSets(scheme: RangeScheme, weight: number | undefined, weekType: WeekType): PlannedSet[] {
  // A deload keeps the weight and halves the work.
  const deload = weekType === 'deload'
  const count = deload ? Math.ceil(scheme.sets / 2) : scheme.sets
  const [low, high] = scheme.reps
  return Array.from({ length: count }, () => ({
    weight,
    reps: low,
    repsMax: deload ? undefined : high,
    amrap: false,
    progression: false,
    tmTest: false,
  }))
}

function flagUnloadable(exerciseId: string, set: PlannedSet, ctx: PlanContext): PlannedSet {
  if (set.weight === undefined || !ctx.canLoad || ctx.canLoad(exerciseId, set.weight)) return set
  return { ...set, unloadable: true }
}

export function planSlot(slot: MainSlot, ctx: PlanContext): PlannedSlot {
  const scheme = ctx.schemes(slot.schemeId)
  if (!scheme) throw new Error(`Unknown scheme "${slot.schemeId}" in slot ${slot.id}`)
  const base = {
    slotId: slot.id,
    exerciseId: slot.exerciseId,
    role: 'main' as const,
    tier: slot.tier,
    schemeId: scheme.id,
    kind: scheme.kind,
  }

  if (scheme.kind === 'range') {
    const sets = rangeSets(scheme, ctx.workingWeights?.[slot.exerciseId], ctx.weekType)
    return {
      ...base,
      missingTm: false,
      warmups: [],
      sets: sets.map((s) => flagUnloadable(slot.exerciseId, s, ctx)),
    }
  }

  const tmExerciseId = slotTmId(slot)
  const tm = ctx.tms[tmExerciseId]
  if (tm === undefined) return { ...base, tmExerciseId, missingTm: true, warmups: [], sets: [] }

  const rounding = ctx.rounding ?? DEFAULT_ROUNDING
  const bar = ctx.barFor?.(slot.exerciseId)
  const sets = percentSetsFor(scheme, ctx.weekType, ctx.waveIndex ?? 0).map((s) =>
    flagUnloadable(
      slot.exerciseId,
      {
        // Light percentages of a light TM can land under the empty bar.
        weight: Math.max(percentOf(tm, s.pct, rounding), bar ?? 0),
        reps: s.reps,
        pct: s.pct,
        amrap: s.amrap ?? false,
        progression: s.progression ?? false,
        tmTest: s.tmTest ?? false,
      },
      ctx,
    ),
  )
  const first = sets[0]?.weight
  const warmups = slot.warmups && first !== undefined ? warmupSets(tm, first, bar, rounding) : []
  const wave = ctx.weekType === 'normal' ? waveName(scheme, ctx.waveIndex ?? 0) : undefined
  return { ...base, tmExerciseId, tm, missingTm: false, warmups, sets, ...(wave ? { wave } : {}) }
}

/** An accessory picked for today. */
export interface AccessoryPick {
  id: string
  exerciseId: string
  sets: number
  reps: [number, number]
  /** Put in when the workout started, from one of the day's pinned slots. Doesn't fill an open slot. */
  pinned?: boolean
}

/**
 * Accessories run like the heavy row: no TM, just a working weight carried
 * over from last time by double progression.
 */
export function planAccessory(pick: AccessoryPick, ctx: PlanContext): PlannedSlot {
  const scheme: RangeScheme = {
    kind: 'range',
    id: rangeSchemeId(pick.sets, pick.reps),
    name: '',
    sets: pick.sets,
    reps: pick.reps,
  }
  const sets = rangeSets(scheme, ctx.workingWeights?.[pick.exerciseId], ctx.weekType)
  return {
    slotId: pick.id,
    exerciseId: pick.exerciseId,
    role: 'accessory',
    schemeId: scheme.id,
    kind: 'range',
    missingTm: false,
    warmups: [],
    sets: sets.map((s) => flagUnloadable(pick.exerciseId, s, ctx)),
  }
}

export function planDay(day: ProgramDay, ctx: PlanContext): PlannedDay {
  return {
    dayId: day.id,
    name: day.name,
    mains: day.mains.map((slot) => planSlot(slot, ctx)),
    accessories: day.accessories,
  }
}

export function planWeek(program: Program, ctx: PlanContext): PlannedDay[] {
  return program.days.map((day) => planDay(day, ctx))
}
