import type { Muscle } from '../engine/types.ts'

export const FOCUS_PRESETS: { id: string; name: string; muscles: Muscle[] }[] = [
  { id: 'bench', name: 'Bench press', muscles: ['chest', 'frontDelts', 'triceps'] },
  { id: 'ohp', name: 'Overhead press', muscles: ['frontDelts', 'sideDelts', 'triceps'] },
  { id: 'squat', name: 'Squat', muscles: ['quads', 'glutes', 'adductors'] },
  { id: 'deadlift', name: 'Deadlift', muscles: ['hamstrings', 'glutes', 'lowerBack', 'upperBack'] },
  { id: 'pull-ups', name: 'Pull-ups', muscles: ['lats', 'biceps', 'upperBack'] },
  { id: 'arms', name: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'glutes', name: 'Glutes', muscles: ['glutes', 'hamstrings'] },
  { id: 'shoulders', name: 'Shoulders', muscles: ['frontDelts', 'sideDelts', 'rearDelts'] },
  { id: 'back', name: 'Back', muscles: ['lats', 'upperBack', 'rearDelts'] },
  { id: 'core', name: 'Core', muscles: ['abs'] },
]

/** Extra accessory sets a week per focused muscle. Three is about one more accessory. */
export const FOCUS_LEVELS: { sets: number; label: string }[] = [
  { sets: 3, label: 'A little' },
  { sets: 6, label: 'More' },
  { sets: 9, label: 'A lot' },
]
