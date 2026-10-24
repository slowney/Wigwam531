import { describe, expect, it } from 'vitest'
import { findExercise } from '../src/data/exercises.ts'
import {
  bests,
  dots,
  e1rmPrs,
  e1rmSeries,
  rangeStart,
  repMaxes,
  tmSteps,
  weeklyVolume,
  type MetricSet,
} from '../src/engine/metrics.ts'

let n = 0
const set = (sessionId: string, at: number, weight: number, reps: number, extra: Partial<MetricSet> = {}): MetricSet => ({
  id: `s${++n}`,
  exerciseId: 'bench-press',
  sessionId,
  weight,
  reps,
  warmup: false,
  at,
  ...extra,
})

describe('e1RM over time', () => {
  const sets = [
    set('a', 1, 185, 5),
    set('a', 2, 205, 3),
    set('a', 3, 45, 10, { warmup: true }),
    set('b', 10, 210, 3),
    set('b', 11, 150, 15), // past 10 reps: no estimate
    set('c', 20, 200, 1),
    set('d', 30, 135, 12),
  ]

  it("takes each workout's best set, ignoring warm-ups and sets past 10 reps", () => {
    const series = e1rmSeries(sets, 'bench-press')
    expect(series.map((p) => [p.sessionId, Math.round(p.e1rm)])).toEqual([
      ['a', 226],
      ['b', 231],
      ['c', 200],
    ])
    expect(series[0]).toMatchObject({ weight: 205, reps: 3 })
  })

  it('marks the workouts that beat every earlier one, never the first', () => {
    const series = e1rmSeries(sets, 'bench-press')
    const prs = e1rmPrs(series)
    expect(series.filter((p) => prs.has(p.setId)).map((p) => p.sessionId)).toEqual(['b'])
  })

  it("can take each week's best instead, so a lift done heavy and light reads as one trend", () => {
    const weekly = [
      set('t1', 1, 225, 3, { weekId: 'w1' }),
      set('t2', 2, 155, 8, { weekId: 'w1' }),
      set('t1b', 8, 230, 3, { weekId: 'w2' }),
    ]
    expect(e1rmSeries(weekly, 'bench-press', 'week').map((p) => p.weight)).toEqual([225, 230])
    expect(e1rmSeries(weekly, 'bench-press')).toHaveLength(3)
  })

  it('leaves out failed sets', () => {
    expect(e1rmSeries([set('x', 1, 300, 0)], 'bench-press')).toEqual([])
  })
})

describe('TM history', () => {
  it('runs oldest first, one step per change', () => {
    const history = [
      { exerciseId: 'bench-press', lb: 210, at: 20, reason: 'progression' },
      { exerciseId: 'bench-press', lb: 200, at: 0, reason: 'start' },
      { exerciseId: 'squat', lb: 300, at: 5, reason: 'start' },
      { exerciseId: 'bench-press', lb: 205, at: 10, reason: 'progression' },
    ]
    expect(tmSteps(history, 'bench-press').map((s) => s.lb)).toEqual([200, 205, 210])
  })
})

describe('rep maxes and bests', () => {
  const sets = [set('a', 1, 225, 3), set('b', 2, 205, 8), set('c', 3, 225, 4), set('d', 4, 235, 1)]

  it('find the heaviest weight done for at least each rep count', () => {
    const table = repMaxes(sets, 'bench-press')
    expect(table.slice(0, 5).map((r) => r?.weight)).toEqual([235, 225, 225, 225, 205])
    expect(table[7]).toMatchObject({ weight: 205, at: 2 })
    expect(table[8]).toBeUndefined()
    // 225 × 3 was done first, so it keeps the earlier date.
    expect(table[2]?.at).toBe(1)
  })

  it('find the best e1RM and the heaviest set', () => {
    const best = bests(sets, 'bench-press')
    expect(best.heaviest).toEqual({ weight: 235, reps: 1, at: 4 })
    expect(best.e1rm).toMatchObject({ weight: 205, reps: 8 })
  })
})

describe('weekly volume', () => {
  it('counts each of the last weeks, oldest first', () => {
    const weeks = [1, 2, 3].map((number) => ({ id: `w${number}`, number }))
    const sets = [
      { weekId: 'w1', exerciseId: 'bench-press', warmup: false },
      { weekId: 'w3', exerciseId: 'bench-press', warmup: false },
      { weekId: 'w3', exerciseId: 'bench-press', warmup: true },
      { weekId: 'w3', exerciseId: 'db-curl', warmup: false },
    ]
    const volume = weeklyVolume(sets, weeks, findExercise, 2)
    expect(volume.map((w) => w.number)).toEqual([2, 3])
    expect(volume[0]!.counts).toEqual({})
    expect(volume[1]!.counts).toMatchObject({ chest: 1, biceps: 1 })
  })
})

describe('DOTS', () => {
  it('matches the published formula', () => {
    // 600 kg total at 100 kg bodyweight is a DOTS of about 369.3.
    expect(dots(600 * 2.20462, 100 * 2.20462, 'male')).toBeCloseTo(369.3, 0)
    expect(dots(400 * 2.20462, 60 * 2.20462, 'female')).toBeGreaterThan(dots(400 * 2.20462, 60 * 2.20462, 'male'))
  })
})

describe('ranges', () => {
  it('count back from now', () => {
    const now = 1_000 * 24 * 60 * 60 * 1000
    expect(now - rangeStart('3M', now)).toBe(91 * 24 * 60 * 60 * 1000)
    expect(rangeStart('All', now)).toBe(-Infinity)
  })
})
