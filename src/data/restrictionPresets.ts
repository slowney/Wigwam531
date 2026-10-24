import type { Restriction } from '../engine/types.ts'

export type RestrictionRule = Omit<Restriction, 'id' | 'until'>

export const RESTRICTION_PRESETS: { id: string; description: string; rule: RestrictionRule }[] = [
  {
    id: 'lower-back',
    description: 'Deadlift-style hinges, swings and bent-over rows.',
    rule: { name: 'Lower back', muscles: [], patterns: [], tags: [], lowerBack: true },
  },
  {
    id: 'shoulder-impingement',
    description: 'Upright rows, bench dips and behind-the-neck work.',
    rule: { name: 'Shoulder impingement', muscles: [], patterns: [], tags: ['shoulderRisk'], lowerBack: false },
  },
  {
    id: 'overhead',
    description: 'Overhead presses and overhead extensions. Landmine presses stay.',
    rule: { name: 'Overhead pressing', muscles: [], patterns: [], tags: ['overhead'], lowerBack: false },
  },
  {
    id: 'knees',
    description: 'Squats, lunges, split squats and step-ups.',
    rule: { name: 'Knees', muscles: [], patterns: ['squat', 'lunge'], tags: [], lowerBack: false },
  },
  {
    id: 'elbows',
    description: 'Curls, extensions, pushdowns and close-grip pressing.',
    rule: { name: 'Elbows', muscles: ['biceps', 'triceps', 'forearms'], patterns: [], tags: [], lowerBack: false },
  },
]
