import type { Muscle, MuscleTargets } from '../engine/types.ts'

// Weekly hard sets per muscle, primary sets counting 1 and secondary 0.5.
// After a stock nSuns week, the gaps these leave add up to about 36 sets:
// three accessory slots a day, four days, three sets each.
export const DEFAULT_TARGETS: MuscleTargets = {
  chest: 10,
  frontDelts: 6,
  sideDelts: 10,
  rearDelts: 8,
  lats: 10,
  upperBack: 10,
  lowerBack: 4,
  biceps: 8,
  triceps: 8,
  forearms: 4,
  abs: 6,
  glutes: 8,
  quads: 10,
  hamstrings: 10,
  adductors: 4,
  calves: 6,
}

/** A person's targets: the defaults, with their own changes on top. */
export function targetsFor(changes?: Partial<Record<Muscle, number>>): MuscleTargets {
  return { ...DEFAULT_TARGETS, ...changes }
}
