import { describe, expect, it } from 'vitest'
import { FIVE_THREE_ONE_BBB, NSUNS_4DAY } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { loadGoals, setGoal } from '../src/db/goals.ts'
import { daysPerWeek, forecastGoal, goalLifts, planTmPerWeek } from '../src/engine/goals.ts'
import type { E1rmPoint } from '../src/engine/metrics.ts'
import { LOWER_TABLE, UPPER_TABLE } from '../src/engine/progression.ts'
import { addLeader, doWorkout, freshDb, lifts } from './helpers.ts'

const DAY = 86_400_000
const NOW = 400 * DAY
const point = (daysAgo: number, e1rm: number): E1rmPoint => ({
  at: NOW - daysAgo * DAY,
  sessionId: `s${daysAgo}`,
  e1rm,
  weight: e1rm,
  reps: 1,
  setId: `set${daysAgo}`,
})

describe('the plan’s pace', () => {
  const plan = (program: typeof NSUNS_4DAY, exerciseId: string, recentStarReps: number[], lower = false) =>
    planTmPerWeek({
      program,
      schemes: findScheme,
      exerciseId,
      region: lower ? 'lower' : 'upper',
      table: lower ? LOWER_TABLE : UPPER_TABLE,
      recentStarReps,
    })

  it('is the nSuns table’s step for the 1+ reps lately, a pass when there are none', () => {
    expect(plan(NSUNS_4DAY, 'bench-press', [])).toBe(5)
    expect(plan(NSUNS_4DAY, 'squat', [5, 4, 4, 6], true)).toBe(10) // median of the last four is 4
    expect(plan(NSUNS_4DAY, 'bench-press', [1, 1, 0, 1])).toBe(0) // stalling: no progress planned
  })

  it('is a 5/3/1 cycle’s step spread over its three weeks', () => {
    expect(plan(FIVE_THREE_ONE_BBB, 'deadlift', [], true)).toBeCloseTo(10 / 3)
    expect(plan(FIVE_THREE_ONE_BBB, 'overhead-press', [])).toBeCloseTo(5 / 3)
  })

  it('is nothing for a lift the program doesn’t drive', () => {
    expect(plan(NSUNS_4DAY, 'barbell-row', [5])).toBeUndefined()
  })
})

describe('the lifts a goal can be set on', () => {
  it('are the TMs the program moves, nSuns or 5/3/1', () => {
    expect(goalLifts(NSUNS_4DAY, findScheme)).toEqual(['bench-press', 'squat', 'overhead-press', 'deadlift'])
    expect(goalLifts(FIVE_THREE_ONE_BBB, findScheme)).toEqual(['bench-press', 'squat', 'overhead-press', 'deadlift'])
  })
})

describe('how long a week takes', () => {
  it('is the usual gap between recent week starts, 7 without enough of them', () => {
    expect(daysPerWeek([])).toBe(7)
    expect(daysPerWeek([0, 9, 18, 26, 35].map((d) => ({ startedAt: d * DAY })))).toBe(9)
    expect(daysPerWeek([0, 1, 2].map((d) => ({ startedAt: d * DAY })))).toBe(4) // never faster than 4
  })
})

describe('a goal’s forecast', () => {
  const base = { exerciseId: 'bench-press', daysPerWeek: 7, now: NOW }

  it('starts from the best e1RM of the last six weeks, or the TM when nothing is logged lately', () => {
    const f = forecastGoal({ ...base, target: 300, e1rms: [point(100, 290), point(30, 250), point(3, 260)], tm: [] })
    expect(f).toMatchObject({ current: 260, currentFrom: 'e1rm', reached: false })
    const old = forecastGoal({ ...base, target: 300, e1rms: [point(100, 290)], tm: [{ at: NOW - 100 * DAY, lb: 225, reason: 'start' }] })
    expect(old).toMatchObject({ current: 250, currentFrom: 'tm' })
  })

  it('is reached once the e1RM gets there', () => {
    expect(forecastGoal({ ...base, target: 250, e1rms: [point(2, 255)], tm: [] }).reached).toBe(true)
  })

  it('on plan: the e1RM moves with the TM, a week in seven resting', () => {
    // +5 TM a week is 5.56 e1RM, times 6/7 for the resets: 4.76 a week. 40 lb away is 8.4 weeks.
    const f = forecastGoal({ ...base, target: 300, e1rms: [point(2, 260)], tm: [], planTmPerWeek: 5 })
    expect(f.plan?.days).toBe(59)
    expect(f.plan?.at).toBe(NOW + 59 * DAY)
    // Slower weeks, later date.
    expect(forecastGoal({ ...base, daysPerWeek: 9, target: 300, e1rms: [point(2, 260)], tm: [], planTmPerWeek: 5 }).plan?.days).toBe(76)
  })

  it('at your pace: how the TM moved over the last 12 weeks, once there is a month of it', () => {
    const tm = [
      { at: NOW - 200 * DAY, lb: 180, reason: 'start' },
      { at: NOW - 84 * DAY, lb: 200, reason: 'progression' },
      { at: NOW - 10 * DAY, lb: 212, reason: 'progression' },
    ]
    // 12 lb of TM in 84 days is 13.3 e1RM, so 0.159 a day; 40 lb away is 252 days.
    const f = forecastGoal({ ...base, target: 300, e1rms: [point(2, 260)], tm })
    expect(f.pace).toMatchObject({ days: 252 })
    expect(forecastGoal({ ...base, target: 300, e1rms: [point(2, 260)], tm: tm.slice(0, 2).map((s) => ({ ...s, lb: 200 })) }).pace).toBe('stalled')
    expect(forecastGoal({ ...base, target: 300, e1rms: [point(2, 260)], tm: [{ at: NOW - 20 * DAY, lb: 200, reason: 'start' }] }).pace).toBeUndefined()
  })
})

describe('goals on a profile', () => {
  it('are set, forecast and cleared', async () => {
    const db = freshDb()
    const lead = await addLeader(db, 'Lead', lifts(225, 275, 135, 315))
    await doWorkout(db, [{ profileId: lead, dayId: 'd1', star: 4 }], 1_000)
    await setGoal(lead, 'bench-press', 315, db)
    await expect(setGoal(lead, 'bench-press', 0, db)).rejects.toThrow('weight')
    const rows = await loadGoals(lead, db, 10 * DAY)
    expect(rows.map((r) => r.exerciseId)).toEqual(expect.arrayContaining(['bench-press', 'squat', 'overhead-press', 'deadlift']))
    const bench = rows.find((r) => r.exerciseId === 'bench-press')!
    expect(bench.forecast).toMatchObject({ target: 315, reached: false, currentFrom: 'e1rm' })
    expect(bench.forecast?.plan).toBeDefined() // 4 reps on the 1+ set: +5 a week
    expect(rows.find((r) => r.exerciseId === 'squat')?.forecast).toBeUndefined()
    await setGoal(lead, 'bench-press', undefined, db)
    expect((await db.profiles.get(lead))?.goals).toEqual({})
  })
})
