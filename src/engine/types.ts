// Shared vocabulary for the engine. Everything here is plain data so the
// same shapes can be stored in IndexedDB, exported to JSON and tested in Node.

export const MUSCLES = [
  'chest',
  'frontDelts',
  'sideDelts',
  'rearDelts',
  'lats',
  'upperBack',
  'lowerBack',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
] as const

export type Muscle = (typeof MUSCLES)[number]

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  frontDelts: 'Front delts',
  sideDelts: 'Side delts',
  rearDelts: 'Rear delts',
  lats: 'Lats',
  upperBack: 'Upper back',
  lowerBack: 'Lower back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms/grip',
  abs: 'Abs',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves',
}

export type Equipment =
  | 'barbell'
  | 'trapBar'
  | 'ezBar'
  | 'rack'
  | 'bench'
  | 'inclineBench'
  | 'dumbbells'
  | 'cable'
  | 'pullupBar'
  | 'dipBars'
  | 'landmine'
  | 'kettlebell'
  | 'bands'
  | 'abWheel'
  | 'abMat'

/** How weight is added, which decides what "the next step up" means. */
export type LoadType =
  | 'barbell'
  | 'trapBar'
  | 'ezBar'
  | 'landmine'
  | 'dumbbell'
  | 'kettlebell'
  | 'cable'
  | 'bodyweight'
  | 'band'

export type Pattern =
  | 'horizontalPush'
  | 'verticalPush'
  | 'horizontalPull'
  | 'verticalPull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'isolation'
  | 'core'
  | 'carry'

export type Tag = 'shoulderRisk'

export interface Exercise {
  /** Permanent once anything is logged against it. Rename `name`, never this. */
  id: string
  name: string
  /** Everything listed is required. */
  equipment: Equipment[]
  pattern: Pattern
  /** Picks the default progression table: lower-body lifts move faster. */
  region: 'upper' | 'lower' | 'core'
  /** 1 for a primary mover, 0.5 for a secondary one. */
  muscles: Partial<Record<Muscle, 1 | 0.5>>
  load: LoadType
  /** Default sets and rep range when used as an accessory. */
  sets: number
  reps: [number, number]
  /** Planks and carries are held for time; `reps` is then seconds. */
  unit?: 'seconds'
  lowerBack?: 'moderate' | 'high'
  tags?: Tag[]
}

export type Stars = 1 | 2 | 3 | 4 | 5

/** One person's opinion of one exercise. Unrated exercises have no row and sort as 3. */
export interface Rating {
  exerciseId: string
  stars?: Stars
  /** Kept separate from stars so un-hiding restores the old rating. */
  hidden: boolean
}

export type ExerciseLookup = (id: string) => Exercise | undefined

/** A set as the engine sees it once logged. Storage adds ids and links. */
export interface LoggedSet {
  exerciseId: string
  weight: number
  reps: number
  warmup: boolean
  /** Copied from the prescription when the set was logged. */
  tmExerciseId?: string
  progression?: boolean
  tmTest?: boolean
  /** Epoch ms. */
  at: number
}

export interface PlatePair {
  weight: number
  pairs: number
}

export interface Gym {
  id: string
  name: string
  equipment: Equipment[]
  bars: { barbell: number; trapBar?: number; ezBar?: number }
  plates: PlatePair[]
  /** Pairs owned, ascending. */
  dumbbells: number[]
  /** Settings the kettlebell can make, ascending. */
  kettlebells: number[]
  /** Step between pins on the cable stack, as printed on the stack. */
  cableStep: number
}
