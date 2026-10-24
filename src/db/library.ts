import { setCustomExercises } from '../data/exercises.ts'
import type { Equipment, Exercise, LoadType, Muscle, Pattern, Rating, Stars, Tag } from '../engine/types.ts'
import { db as defaultDb, newId, type CustomExerciseRow, type WigwamDb } from './db.ts'

export async function loadCustomExercises(db: WigwamDb = defaultDb): Promise<CustomExerciseRow[]> {
  return db.exercises.toArray()
}

/** Refreshes the lookup's copy of the custom exercises. Called on launch and on every change. */
export async function syncCustomExercises(db: WigwamDb = defaultDb): Promise<void> {
  setCustomExercises(await loadCustomExercises(db))
}

const LOWER: Muscle[] = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves']

export interface NewExercise {
  name: string
  load: LoadType
  /** Beyond what the load type implies (dumbbells for a dumbbell lift, say). */
  extraEquipment: Equipment[]
  pattern: Pattern
  primary: Muscle[]
  secondary: Muscle[]
  sets: number
  reps: [number, number]
  seconds: boolean
  tags: Tag[]
  lowerBack: boolean
}

const LOAD_EQUIPMENT: Partial<Record<LoadType, Equipment[]>> = {
  barbell: ['barbell'],
  trapBar: ['trapBar'],
  ezBar: ['ezBar'],
  landmine: ['landmine', 'barbell'],
  dumbbell: ['dumbbells'],
  kettlebell: ['kettlebell'],
  cable: ['cable'],
  band: ['bands'],
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'exercise'

/** Builds the stored exercise. Ids are permanent, so they get a random tail rather than relying on the name. */
export function customExercise(input: NewExercise, id = `custom-${slug(input.name)}-${newId().slice(0, 6)}`): Exercise {
  const name = input.name.trim()
  if (!name) throw new Error('Give it a name.')
  if (input.primary.length === 0) throw new Error('Pick at least one main muscle.')
  if (!(input.sets >= 1 && input.reps[0] >= 1 && input.reps[0] <= input.reps[1])) {
    throw new Error('Sets and reps need to be at least 1, low end first.')
  }
  const muscles: Exercise['muscles'] = {}
  for (const m of input.secondary) muscles[m] = 0.5
  for (const m of input.primary) muscles[m] = 1
  const equipment = [...new Set([...(LOAD_EQUIPMENT[input.load] ?? []), ...input.extraEquipment])]
  return {
    id,
    name,
    equipment,
    pattern: input.pattern,
    region: input.primary.some((m) => LOWER.includes(m)) ? 'lower' : input.primary.includes('abs') ? 'core' : 'upper',
    muscles,
    load: input.load,
    sets: input.sets,
    reps: [input.reps[0], input.reps[1]],
    ...(input.seconds ? { unit: 'seconds' as const } : {}),
    ...(input.lowerBack ? { lowerBack: 'moderate' as const } : {}),
    ...(input.tags.length ? { tags: [...input.tags] } : {}),
  }
}

export async function addCustomExercise(input: NewExercise, db: WigwamDb = defaultDb, now = Date.now()): Promise<Exercise> {
  const exercise = customExercise(input)
  await db.exercises.add({ ...exercise, createdAt: now })
  await syncCustomExercises(db)
  return exercise
}

export async function loadRatings(profileId: string, db: WigwamDb = defaultDb): Promise<Map<string, Rating>> {
  const rows = await db.ratings.where('profileId').equals(profileId).toArray()
  return new Map(rows.map((r) => [r.exerciseId, { exerciseId: r.exerciseId, stars: r.stars, hidden: r.hidden }]))
}

/**
 * Sets stars and/or hidden. `stars: null` clears the stars. A rating with
 * neither left is deleted, so the exercise goes back to "new".
 */
export async function setRating(
  profileId: string,
  exerciseId: string,
  change: { stars?: Stars | null; hidden?: boolean },
  db: WigwamDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.ratings, async () => {
    const current = await db.ratings.get([profileId, exerciseId])
    const stars = change.stars === null ? undefined : (change.stars ?? current?.stars)
    const hidden = change.hidden ?? current?.hidden ?? false
    if (stars === undefined && !hidden) {
      await db.ratings.delete([profileId, exerciseId])
      return
    }
    await db.ratings.put({ profileId, exerciseId, ...(stars !== undefined ? { stars } : {}), hidden })
  })
}
