import type { Muscle, MuscleTargets } from '../engine/types.ts'

// Weekly hard sets per muscle, primary sets counting 1 and secondary 0.5.
// After a stock nSuns + heavy row week the gaps these leave add up to about
// 48 sets, more than the 36 that three open slots a day hold (four days,
// three sets each). So something is always behind, and a focus decides
// what gets the space first. Calves are low on purpose: the garage has no
// good way to train them.
export const DEFAULT_TARGETS: MuscleTargets = {
  chest: 12,
  frontDelts: 6,
  sideDelts: 14,
  rearDelts: 12,
  lats: 14,
  upperBack: 10,
  lowerBack: 4,
  biceps: 12,
  triceps: 12,
  forearms: 4,
  abs: 10,
  glutes: 12,
  quads: 10,
  hamstrings: 12,
  adductors: 4,
  calves: 3,
}

/** A person's targets: the defaults, with their own changes on top. */
export function targetsFor(changes?: Partial<Record<Muscle, number>>): MuscleTargets {
  return { ...DEFAULT_TARGETS, ...changes }
}
