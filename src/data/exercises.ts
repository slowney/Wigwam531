import type { Exercise, ExerciseLookup } from '../engine/types.ts'
import { ACCESSORIES } from './accessories.ts'

// IDs are permanent once shipped: logged sets point at them. Fix a name by
// editing `name`, never `id`.

export const MAIN_LIFTS: Exercise[] = [
  {
    id: 'bench-press',
    name: 'Bench press',
    short: 'Bench',
    equipment: ['barbell', 'bench', 'rack'],
    pattern: 'horizontalPush',
    region: 'upper',
    muscles: { chest: 1, triceps: 0.5, frontDelts: 0.5 },
    load: 'barbell',
    sets: 3,
    reps: [5, 8],
  },
  {
    id: 'overhead-press',
    name: 'Overhead press',
    short: 'OHP',
    equipment: ['barbell', 'rack'],
    pattern: 'verticalPush',
    region: 'upper',
    muscles: { frontDelts: 1, sideDelts: 0.5, triceps: 0.5 },
    load: 'barbell',
    sets: 3,
    reps: [5, 8],
    tags: ['overhead'],
  },
  {
    id: 'squat',
    name: 'Squat',
    equipment: ['barbell', 'rack'],
    pattern: 'squat',
    region: 'lower',
    muscles: { quads: 1, glutes: 1, adductors: 0.5, lowerBack: 0.5 },
    load: 'barbell',
    sets: 3,
    reps: [5, 8],
    lowerBack: 'moderate',
  },
  {
    // Hamstrings only count as secondary: deadlifts load them, but not
    // through enough range to replace curls or RDLs.
    id: 'deadlift',
    name: 'Deadlift',
    equipment: ['barbell'],
    pattern: 'hinge',
    region: 'lower',
    muscles: { glutes: 1, lowerBack: 1, hamstrings: 0.5, quads: 0.5, upperBack: 0.5, forearms: 0.5 },
    load: 'barbell',
    sets: 3,
    reps: [3, 5],
    lowerBack: 'high',
  },
  {
    id: 'sumo-deadlift',
    name: 'Sumo deadlift',
    short: 'Sumo',
    equipment: ['barbell'],
    pattern: 'hinge',
    region: 'lower',
    muscles: {
      glutes: 1,
      adductors: 1,
      quads: 0.5,
      hamstrings: 0.5,
      lowerBack: 0.5,
      upperBack: 0.5,
      forearms: 0.5,
    },
    load: 'barbell',
    sets: 3,
    reps: [3, 5],
    lowerBack: 'high',
  },
  {
    id: 'incline-bench-press',
    name: 'Incline bench press',
    short: 'Incline',
    equipment: ['barbell', 'inclineBench', 'rack'],
    pattern: 'horizontalPush',
    region: 'upper',
    muscles: { chest: 1, frontDelts: 0.5, triceps: 0.5 },
    load: 'barbell',
    sets: 3,
    reps: [6, 10],
  },
  {
    id: 'front-squat',
    name: 'Front squat',
    short: 'Front squat',
    equipment: ['barbell', 'rack'],
    pattern: 'squat',
    region: 'lower',
    muscles: { quads: 1, glutes: 0.5, upperBack: 0.5, abs: 0.5 },
    load: 'barbell',
    sets: 3,
    reps: [5, 8],
    lowerBack: 'moderate',
  },
  {
    id: 'barbell-row',
    name: 'Barbell row',
    short: 'Row',
    equipment: ['barbell'],
    pattern: 'horizontalPull',
    region: 'upper',
    muscles: { upperBack: 1, lats: 1, rearDelts: 0.5, biceps: 0.5, lowerBack: 0.5 },
    load: 'barbell',
    sets: 4,
    reps: [6, 8],
    lowerBack: 'high',
  },
]

export const EXERCISES: Exercise[] = [...MAIN_LIFTS, ...ACCESSORIES]

const byId = new Map(EXERCISES.map((e) => [e.id, e]))

// Exercises added in the app live in IndexedDB. The app keeps this copy in
// step with them, so every lookup (and everything that plans or labels a
// lift) sees them without being handed a second list.
let custom = new Map<string, Exercise>()

export function setCustomExercises(list: ReadonlyArray<Exercise>): void {
  custom = new Map(list.map((e) => [e.id, e]))
}

export const findExercise: ExerciseLookup = (id) => byId.get(id) ?? custom.get(id)

/** Built-ins first, then the ones added in the app. */
export function allExercises(): Exercise[] {
  return [...EXERCISES, ...custom.values()]
}
