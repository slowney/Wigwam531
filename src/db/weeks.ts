import Dexie from 'dexie'
import { findExercise } from '../data/exercises.ts'
import { findScheme } from '../data/schemes.ts'
import type { WeekType } from '../engine/plan.ts'
import { requiredTms, type Program, type ProgramDay } from '../engine/program.ts'
import { defaultTable, proposeTmChanges, type TmProposal } from '../engine/progression.ts'
import {
  isWeekComplete,
  pendingDays,
  progressionReps,
  tmTestReps,
  type DayStatus,
  type WeekState,
} from '../engine/week.ts'
import { db as defaultDb, newId, type TmChangeReason, type WeekRow, type WigwamDb } from './db.ts'
import { loadProgram, loadTms } from './profiles.ts'

export function weekState(week: WeekRow): WeekState {
  return { number: week.number, type: week.type, days: week.days }
}

export async function currentWeek(profileId: string, db: WigwamDb = defaultDb): Promise<WeekRow | undefined> {
  return db.weeks
    .where('[profileId+number]')
    .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
    .last()
}

/** Ended by hand, or every day done or skipped. */
export function weekComplete(week: WeekRow, program: Program): boolean {
  return week.endedAt !== undefined || isWeekComplete(program, weekState(week))
}

/** A new profile's Week 1 starts on its own at their first workout: there's nothing to review yet. */
export async function ensureFirstWeek(profileId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<WeekRow> {
  return db.transaction('rw', db.weeks, async () => {
    const existing = await currentWeek(profileId, db)
    if (existing) return existing
    const week: WeekRow = { id: newId(), profileId, number: 1, type: 'normal', startedAt: now, days: {} }
    await db.weeks.add(week)
    return week
  })
}

export interface WeekOverview {
  /** Undefined before the first workout. */
  week?: WeekRow
  program?: Program
  complete: boolean
  pending: ProgramDay[]
}

export async function loadWeekOverview(profileId: string, db: WigwamDb = defaultDb): Promise<WeekOverview> {
  const program = await loadProgram(profileId, db)
  const week = await currentWeek(profileId, db)
  if (!program) return { week, program, complete: false, pending: [] }
  if (!week) return { week, program, complete: false, pending: program.days }
  const complete = weekComplete(week, program)
  return { week, program, complete, pending: complete ? [] : pendingDays(program, weekState(week)) }
}

/**
 * A day's new status, plus the week's completion stamp: set the moment the
 * last day is done or skipped, cleared if a day is unskipped again.
 */
export async function setDayStatus(
  weekId: string,
  dayId: string,
  status: DayStatus,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', [db.weeks, db.programs], async () => {
    const week = await db.weeks.get(weekId)
    if (!week) return
    const days = { ...week.days, [dayId]: status }
    const program = await loadProgram(week.profileId, db)
    await db.weeks.update(weekId, { days, completedAt: completedAtFor(week, days, program, now) })
  })
}

export function completedAtFor(
  week: WeekRow,
  days: Record<string, DayStatus>,
  program: Program | undefined,
  now: number,
): number | undefined {
  if (!program) return week.completedAt
  const done = isWeekComplete(program, { number: week.number, type: week.type, days })
  return done ? (week.completedAt ?? now) : undefined
}

/** Skips whatever is left, so the week can be reviewed and the next one started. */
export async function endWeek(weekId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', [db.weeks, db.programs], async () => {
    const week = await db.weeks.get(weekId)
    if (!week) return
    const program = await loadProgram(week.profileId, db)
    await db.weeks.update(weekId, {
      days: skipPending(week, program),
      endedAt: week.endedAt ?? now,
      completedAt: week.completedAt ?? now,
    })
  })
}

function skipPending(week: WeekRow, program: Program | undefined): Record<string, DayStatus> {
  const days = { ...week.days }
  for (const d of program?.days ?? []) if ((days[d.id] ?? 'pending') === 'pending') days[d.id] = 'skipped'
  return days
}

export interface WeekReview {
  week: WeekRow
  proposals: TmProposal[]
}

/** What Start Week shows: each TM's suggested change, from the week that's ending. */
export async function loadWeekReview(profileId: string, db: WigwamDb = defaultDb): Promise<WeekReview | undefined> {
  const week = await currentWeek(profileId, db)
  const program = await loadProgram(profileId, db)
  if (!week || !program) return undefined
  const profile = await db.profiles.get(profileId)
  const current = await loadTms(profileId, db)
  const tms: Record<string, number> = {}
  for (const id of requiredTms(program, findScheme)) {
    const tm = current[id]
    if (tm !== undefined) tms[id] = tm
  }
  const sets = await db.sets.where('profileId').equals(profileId).toArray()
  const thisWeek = sets.filter((s) => s.weekId === week.id)
  const proposals = proposeTmChanges({
    weekType: week.type,
    tms,
    results: week.type === 'tmTest' ? tmTestReps(thisWeek) : progressionReps(thisWeek),
    // Weeks run in order, so every other week's 1+ sets came earlier.
    previous: progressionReps(sets.filter((s) => s.weekId !== week.id)),
    tables: (id) => profile?.progressionTables?.[id] ?? defaultTable(findExercise(id)?.region ?? 'upper'),
  })
  return { week, proposals }
}

export interface WeekStart {
  profileId: string
  type: WeekType
  /** The TMs as confirmed at Start Week. Only ones that changed are written. */
  tms: Array<{ exerciseId: string; lb: number; reason: TmChangeReason }>
}

export async function startWeeks(starts: WeekStart[], db: WigwamDb = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', [db.weeks, db.trainingMaxes, db.programs], async () => {
    for (const start of starts) {
      const current = await currentWeek(start.profileId, db)
      if (current) {
        const program = await loadProgram(start.profileId, db)
        await db.weeks.update(current.id, {
          days: skipPending(current, program),
          endedAt: current.endedAt ?? now,
          completedAt: current.completedAt ?? now,
        })
      }
      const tms = await loadTms(start.profileId, db)
      for (const change of start.tms) {
        if (!(Number.isFinite(change.lb) && change.lb > 0)) throw new Error('A TM has to be a positive number of pounds.')
        if (change.lb === tms[change.exerciseId]) continue
        await db.trainingMaxes.add({
          id: newId(),
          profileId: start.profileId,
          exerciseId: change.exerciseId,
          lb: change.lb,
          at: now,
          reason: change.reason,
        })
      }
      await db.weeks.add({
        id: newId(),
        profileId: start.profileId,
        number: (current?.number ?? 0) + 1,
        type: start.type,
        startedAt: now,
        days: {},
      })
    }
  })
}
