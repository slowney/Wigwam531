// Per-person settings Phase 4 adds: custom exercises, ratings, muscle
// targets and restrictions.
import { afterEach, describe, expect, it } from 'vitest'
import { allExercises, findExercise, setCustomExercises } from '../src/data/exercises.ts'
import { RESTRICTION_PRESETS } from '../src/data/restrictionPresets.ts'
import { DEFAULT_TARGETS } from '../src/data/targets.ts'
import { addCustomExercise, customExercise, loadRatings, setRating, type NewExercise } from '../src/db/library.ts'
import { loadTargets, resetMuscleTargets, setMuscleTarget } from '../src/db/profiles.ts'
import { addRestriction, loadRestrictions, removeRestriction } from '../src/db/restrictions.ts'
import { addLeader, freshDb, lifts } from './helpers.ts'

afterEach(() => setCustomExercises([]))

const yRaise: NewExercise = {
  name: '  Cable Y-raise ',
  load: 'cable',
  extraEquipment: [],
  pattern: 'isolation',
  primary: ['sideDelts'],
  secondary: ['upperBack'],
  sets: 3,
  reps: [12, 15],
  seconds: false,
  tags: [],
  lowerBack: false,
}

describe('custom exercises', () => {
  it('are built from the quick-add form', () => {
    expect(customExercise(yRaise, 'custom-x')).toEqual({
      id: 'custom-x',
      name: 'Cable Y-raise',
      equipment: ['cable'],
      pattern: 'isolation',
      region: 'upper',
      muscles: { sideDelts: 1, upperBack: 0.5 },
      load: 'cable',
      sets: 3,
      reps: [12, 15],
    })
  })

  it('work out their region, timing, tags and lower-back load', () => {
    const plank = customExercise(
      { ...yRaise, name: 'Weighted plank', load: 'bodyweight', primary: ['abs'], secondary: [], seconds: true },
      'p',
    )
    expect(plank).toMatchObject({ region: 'core', unit: 'seconds', equipment: [] })
    const pull = customExercise(
      { ...yRaise, name: 'Rack pull', load: 'barbell', primary: ['glutes', 'upperBack'], lowerBack: true, extraEquipment: ['rack'] },
      'r',
    )
    expect(pull).toMatchObject({ region: 'lower', lowerBack: 'moderate', equipment: ['barbell', 'rack'] })
  })

  it('need a name, a main muscle and sensible reps', () => {
    expect(() => customExercise({ ...yRaise, name: ' ' })).toThrow('name')
    expect(() => customExercise({ ...yRaise, primary: [] })).toThrow('main muscle')
    expect(() => customExercise({ ...yRaise, reps: [15, 12] })).toThrow('low end first')
  })

  it('are saved with a permanent id and show up in every lookup', async () => {
    const db = freshDb()
    const added = await addCustomExercise(yRaise, db, 5)
    expect(added.id).toMatch(/^custom-cable-y-raise-[0-9a-f]{6}$/)
    expect(await db.exercises.get(added.id)).toMatchObject({ name: 'Cable Y-raise', createdAt: 5 })
    expect(findExercise(added.id)?.name).toBe('Cable Y-raise')
    expect(allExercises().at(-1)?.id).toBe(added.id)
  })
})

describe('ratings', () => {
  it('set stars, hide, and fall back to "new" when cleared', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await setRating(id, 'face-pull', { stars: 5 }, db)
    await setRating(id, 'face-pull', { hidden: true }, db)
    expect((await loadRatings(id, db)).get('face-pull')).toEqual({ exerciseId: 'face-pull', stars: 5, hidden: true })

    // Unhiding keeps the stars.
    await setRating(id, 'face-pull', { hidden: false }, db)
    expect((await loadRatings(id, db)).get('face-pull')).toEqual({ exerciseId: 'face-pull', stars: 5, hidden: false })

    await setRating(id, 'face-pull', { stars: null }, db)
    expect((await loadRatings(id, db)).has('face-pull')).toBe(false)
  })
})

describe('muscle targets', () => {
  it('start at the defaults and keep only real changes', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    expect(await loadTargets(id, db)).toEqual(DEFAULT_TARGETS)

    await setMuscleTarget(id, 'calves', 3.3, db)
    await setMuscleTarget(id, 'lats', 12, db)
    expect(await loadTargets(id, db)).toEqual({ ...DEFAULT_TARGETS, calves: 3.5, lats: 12 })

    await setMuscleTarget(id, 'lats', DEFAULT_TARGETS.lats, db)
    expect((await db.profiles.get(id))?.muscleTargets).toEqual({ calves: 3.5 })

    await resetMuscleTargets(id, db)
    expect(await loadTargets(id, db)).toEqual(DEFAULT_TARGETS)
  })
})

describe('restrictions', () => {
  it('are kept per person, with an optional end date', async () => {
    const db = freshDb()
    const id = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    const knees = RESTRICTION_PRESETS.find((p) => p.id === 'knees')!.rule
    const back = RESTRICTION_PRESETS.find((p) => p.id === 'lower-back')!.rule
    const kneesId = await addRestriction(id, knees, 2_000, db, 1)
    await addRestriction(id, back, undefined, db, 2)

    const list = await loadRestrictions(id, db)
    expect(list.map((r) => [r.name, r.until])).toEqual([
      ['Knees', 2_000],
      ['Lower back', undefined],
    ])
    await removeRestriction(kneesId, db)
    expect((await loadRestrictions(id, db)).map((r) => r.name)).toEqual(['Lower back'])
  })
})
