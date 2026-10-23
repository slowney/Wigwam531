import type { Gym } from '../engine/types.ts'

const range = (from: number, to: number, step: number) =>
  Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step)

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
  bars: { barbell: 45, trapBar: 45, ezBar: 20 },
  // One pair of each: 320 lb is the most the barbell can hold.
  plates: [45, 35, 25, 15, 10, 5, 2.5].map((weight) => ({ weight, pairs: 1 })),
  dumbbells: range(5, 55, 5),
  // Adjustable kettlebell.
  kettlebells: range(5, 40, 5),
  // F22 stack plates. The 2:1 pulley halves what the handle feels, but
  // logs use the number on the stack so they match what gets pinned.
  cableStep: 10,
}
