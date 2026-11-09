import { findExercise } from '../data/exercises.ts'
import { findScheme } from '../data/schemes.ts'
import { daysPerWeek, forecastGoal, goalLifts, planTmPerWeek, type GoalForecast } from '../engine/goals.ts'
import { e1rmSeries, tmSteps } from '../engine/metrics.ts'
import { defaultTable } from '../engine/progression.ts'
import { db as defaultDb, type WigwamDb } from './db.ts'
import { loadProgram } from './profiles.ts'

/** A target e1RM for one lift; undefined clears it. */
export async function setGoal(
  profileId: string,
  exerciseId: string,
  lb: number | undefined,
  db: WigwamDb = defaultDb,
): Promise<void> {
  if (lb !== undefined && !(Number.isFinite(lb) && lb > 0)) throw new Error('A goal needs a weight.')
  await db.transaction('rw', db.profiles, async () => {
    const profile = await db.profiles.get(profileId)
    if (!profile) return
    const goals = { ...profile.goals }
    if (lb === undefined) delete goals[exerciseId]
    else goals[exerciseId] = lb
    await db.profiles.update(profileId, { goals })
  })
}

export interface GoalRow {
  exerciseId: string
  /** Undefined until a target is set. */
  forecast?: GoalForecast
}

/** The lifts whose TM the program moves, plus any that still have a goal, each with its forecast. */
export async function loadGoals(profileId: string, db: WigwamDb = defaultDb, now = Date.now()): Promise<GoalRow[]> {
  const profile = await db.profiles.get(profileId)
  const program = await loadProgram(profileId, db)
  if (!profile || !program) return []
  const goals = profile.goals ?? {}
  const lifts = [...new Set([...goalLifts(program, findScheme), ...Object.keys(goals)])]
  const sets = await db.sets.where('profileId').equals(profileId).toArray()
  const tms = await db.trainingMaxes.where('profileId').equals(profileId).toArray()
  const days = daysPerWeek(await db.weeks.where('profileId').equals(profileId).toArray())

  return lifts.map((exerciseId) => {
    const target = goals[exerciseId]
    if (target === undefined) return { exerciseId }
    const region = findExercise(exerciseId)?.region ?? 'upper'
    const starReps = sets
      .filter((s) => s.progression && !s.warmup && (s.tmExerciseId ?? s.exerciseId) === exerciseId)
      .sort((a, b) => a.at - b.at)
      .map((s) => s.reps)
    return {
      exerciseId,
      forecast: forecastGoal({
        exerciseId,
        target,
        e1rms: e1rmSeries(sets, exerciseId, 'week'),
        tm: tmSteps(tms, exerciseId),
        planTmPerWeek: planTmPerWeek({
          program,
          schemes: findScheme,
          exerciseId,
          region,
          table: profile.progressionTables?.[exerciseId] ?? defaultTable(region),
          recentStarReps: starReps,
        }),
        daysPerWeek: days,
        now,
      }),
    }
  })
}
