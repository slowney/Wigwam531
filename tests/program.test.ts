import { describe, expect, it } from 'vitest'
import { NSUNS_4DAY } from '../src/data/presets.ts'
import { resolveProgram, type Program, type ProgramOverrides } from '../src/engine/program.ts'
import type { LoggedSet } from '../src/engine/types.ts'
import { isWeekComplete, nextDay, progressionReps, tmTestReps, type WeekState } from '../src/engine/week.ts'

const slot = (program: Program, id: string) =>
  program.days.flatMap((d) => d.mains).find((m) => m.id === id)

describe('following a leader', () => {
  // A partner who pulls from a trap bar instead of a straight bar.
  const overrides: ProgramOverrides = { slots: { 'd4-t1': { exerciseId: 'trap-bar-deadlift' } } }

  it("is the leader's program plus the follower's overrides", () => {
    const mine = resolveProgram(NSUNS_4DAY, overrides)
    expect(slot(mine, 'd4-t1')?.exerciseId).toBe('trap-bar-deadlift')
    expect(slot(mine, 'd4-t1')?.schemeId).toBe('nsuns-t1-deadlift')
    expect(slot(mine, 'd1-t1')).toEqual(slot(NSUNS_4DAY, 'd1-t1'))
  })

  it("picks up the leader's later edits and keeps the override", () => {
    const edited: Program = {
      ...NSUNS_4DAY,
      days: NSUNS_4DAY.days.map((d) =>
        d.id === 'd4'
          ? { ...d, mains: d.mains.map((m) => (m.id === 'd4-t2' ? { ...m, exerciseId: 'squat' } : m)) }
          : d,
      ),
    }
    const mine = resolveProgram(edited, overrides)
    expect(slot(mine, 'd4-t2')?.exerciseId).toBe('squat')
    expect(slot(mine, 'd4-t1')?.exerciseId).toBe('trap-bar-deadlift')
  })

  it('drops overrides for slots the leader deleted', () => {
    const trimmed: Program = {
      ...NSUNS_4DAY,
      days: NSUNS_4DAY.days.map((d) => (d.id === 'd4' ? { ...d, mains: d.mains.slice(1) } : d)),
    }
    expect(slot(resolveProgram(trimmed, overrides), 'd4-t1')).toBeUndefined()
  })
})

describe('weeks', () => {
  const week = (days: WeekState['days']): WeekState => ({ number: 7, type: 'normal', days })

  it('offers the first pending day next', () => {
    expect(nextDay(NSUNS_4DAY, week({}))?.id).toBe('d1')
    expect(nextDay(NSUNS_4DAY, week({ d1: 'done', d2: 'skipped' }))?.id).toBe('d3')
  })

  it('lets days be done out of order', () => {
    expect(nextDay(NSUNS_4DAY, week({ d1: 'done', d3: 'done' }))?.id).toBe('d2')
  })

  it('is complete once every day is done or skipped', () => {
    expect(isWeekComplete(NSUNS_4DAY, week({ d1: 'done', d2: 'done', d3: 'skipped', d4: 'done' }))).toBe(true)
    expect(isWeekComplete(NSUNS_4DAY, week({ d1: 'done', d2: 'done', d3: 'skipped' }))).toBe(false)
  })

  it('treats a day added mid-week as pending', () => {
    const fiveDay: Program = {
      ...NSUNS_4DAY,
      days: [...NSUNS_4DAY.days, { id: 'd5', name: 'Day 5', mains: [], accessories: [] }],
    }
    const done = week({ d1: 'done', d2: 'done', d3: 'done', d4: 'done' })
    expect(isWeekComplete(NSUNS_4DAY, done)).toBe(true)
    expect(nextDay(fiveDay, done)?.id).toBe('d5')
  })
})

describe('reading results back out of logged sets', () => {
  const set = (overrides: Partial<LoggedSet>): LoggedSet => ({
    exerciseId: 'bench-press',
    weight: 215,
    reps: 3,
    warmup: false,
    tmExerciseId: 'bench-press',
    at: 0,
    ...overrides,
  })

  it("takes each TM's 1+ set, ignoring other sets", () => {
    const sets = [
      set({ reps: 5 }),
      set({ progression: true, reps: 4, at: 2 }),
      set({ exerciseId: 'squat', tmExerciseId: 'squat', progression: true, reps: 6, at: 3 }),
      set({ progression: true, reps: 9, warmup: true, at: 4 }),
    ]
    expect(progressionReps(sets)).toEqual({ 'bench-press': 4, squat: 6 })
  })

  it('uses the latest 1+ set when a TM has two in one week', () => {
    const sets = [set({ progression: true, reps: 2, at: 1 }), set({ progression: true, reps: 5, at: 9 })]
    expect(progressionReps(sets)).toEqual({ 'bench-press': 5 })
  })

  it('reads the 100% set of a TM test', () => {
    const sets = [set({ reps: 5, at: 1 }), set({ tmTest: true, weight: 225, reps: 4, at: 2 })]
    expect(tmTestReps(sets)).toEqual({ 'bench-press': 4 })
  })
})
