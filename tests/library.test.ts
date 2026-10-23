import { describe, expect, it } from 'vitest'
import { ACCESSORIES } from '../src/data/accessories.ts'
import { EXERCISES, MAIN_LIFTS } from '../src/data/exercises.ts'
import { HOME_GYM } from '../src/data/gym.ts'
import { presetRatings } from '../src/data/ratingPresets.ts'
import { MUSCLES, type Equipment, type LoadType } from '../src/engine/types.ts'

const LOAD_NEEDS: Record<LoadType, Equipment | undefined> = {
  barbell: 'barbell',
  trapBar: 'trapBar',
  ezBar: 'ezBar',
  landmine: 'landmine',
  dumbbell: 'dumbbells',
  kettlebell: 'kettlebell',
  cable: 'cable',
  band: 'bands',
  bodyweight: undefined,
}

describe('exercise library', () => {
  it('has the 92 accessories we agreed on, on top of the main lifts', () => {
    expect(ACCESSORIES).toHaveLength(92)
    expect(EXERCISES).toHaveLength(92 + MAIN_LIFTS.length)
  })

  it('never reuses an id', () => {
    const ids = EXERCISES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses kebab-case ids', () => {
    for (const e of EXERCISES) expect(e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('keeps the main-lift ids that logged sets point at', () => {
    expect(MAIN_LIFTS.map((e) => e.id)).toEqual([
      'bench-press',
      'overhead-press',
      'squat',
      'deadlift',
      'sumo-deadlift',
      'incline-bench-press',
      'front-squat',
      'barbell-row',
    ])
  })

  it('gives every exercise a primary mover, and only known muscles', () => {
    for (const e of EXERCISES) {
      expect(Object.values(e.muscles), e.id).toContain(1)
      for (const m of Object.keys(e.muscles)) expect(MUSCLES, `${e.id}: ${m}`).toContain(m)
    }
  })

  it('only needs equipment the garage has', () => {
    for (const e of EXERCISES) {
      for (const item of e.equipment) expect(HOME_GYM.equipment, `${e.id}: ${item}`).toContain(item)
    }
  })

  it('lists the equipment its load type needs', () => {
    for (const e of EXERCISES) {
      const needed = LOAD_NEEDS[e.load]
      if (needed) expect(e.equipment, e.id).toContain(needed)
    }
  })

  it('has sensible sets and rep ranges', () => {
    for (const e of EXERCISES) {
      expect(e.sets, e.id).toBeGreaterThanOrEqual(1)
      expect(e.sets, e.id).toBeLessThanOrEqual(6)
      expect(e.reps[0], e.id).toBeGreaterThanOrEqual(1)
      expect(e.reps[0], e.id).toBeLessThan(e.reps[1])
    }
  })

  it('tags exactly the lifts you asked to hide as shoulder risks', () => {
    const risky = EXERCISES.filter((e) => e.tags?.includes('shoulderRisk')).map((e) => e.id)
    expect(risky.sort()).toEqual([
      'behind-neck-press',
      'behind-neck-pulldown',
      'bench-dip',
      'cable-upright-row',
      'ez-upright-row',
    ])
  })
})

describe('rating presets', () => {
  const ratings = presetRatings('dumbbell-first', EXERCISES)
  const byId = new Map(ratings.map((r) => [r.exerciseId, r]))

  it('starts every dumbbell accessory at 4 stars', () => {
    for (const e of EXERCISES.filter((x) => x.load === 'dumbbell')) {
      expect(byId.get(e.id), e.id).toEqual({ exerciseId: e.id, stars: 4, hidden: false })
    }
  })

  it('hides the shoulder risks', () => {
    expect(byId.get('ez-upright-row')).toEqual({ exerciseId: 'ez-upright-row', hidden: true })
    expect(byId.get('bench-dip')?.hidden).toBe(true)
  })

  it('keeps dips and the Arnold press, which you said are fine', () => {
    expect(byId.get('dips')).toBeUndefined()
    expect(byId.get('arnold-press')).toEqual({ exerciseId: 'arnold-press', stars: 4, hidden: false })
  })

  it('leaves everything else unrated', () => {
    expect(byId.get('face-pull')).toBeUndefined()
    expect(byId.get('bench-press')).toBeUndefined()
  })

  it('gives a blank start nothing at all', () => {
    expect(presetRatings('blank', EXERCISES)).toEqual([])
  })
})
