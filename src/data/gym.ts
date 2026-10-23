import type { Gym } from '../engine/types.ts'

export const HOME_GYM: Gym = {
  id: 'home',
  name: 'Home',
  equipment: [
    'barbell',
    'trapBar',
    'ezBar',
    'rack',
    'bench',
    'inclineBench',
    'dumbbells',
    'cable',
    'pullupBar',
    'dipBars',
    'landmine',
    'kettlebell',
    'bands',
    'abWheel',
    'abMat',
  ],
  // Trap and EZ bar weights are guesses until they're weighed; editable in Settings.
  bars: { barbell: 45, trapBar: 45, ezBar: 20 },
  // One pair of each: 320 lb is the most the barbell can hold.
  plates: [45, 35, 25, 15, 10, 5, 2.5].map((weight) => ({ weight, pairs: 1 })),
  dumbbells: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
  // Adjustable kettlebell; its settings aren't known yet.
  kettlebells: [],
  // F22 stack plates. The 2:1 pulley halves what the handle feels, but
  // logs use the number on the stack so they match what gets pinned.
  cableStep: 10,
}
