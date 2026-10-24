import { describe, expect, it } from 'vitest'
import { checkPr, e1rm } from '../src/engine/records.ts'

describe('e1RM', () => {
  it('is the weight itself for a single', () => {
    expect(e1rm(315, 1)).toBe(315)
  })

  it('uses Epley up to 10 reps', () => {
    expect(e1rm(225, 5)).toBeCloseTo(262.5)
    expect(e1rm(200, 10)).toBeCloseTo(266.67, 1)
  })

  it('gives no estimate past 10 reps or for a missed set', () => {
    expect(e1rm(135, 11)).toBeUndefined()
    expect(e1rm(225, 0)).toBeUndefined()
  })
})

describe('PR checks', () => {
  const history = [
    { weight: 45, reps: 10, warmup: true },
    { weight: 225, reps: 5, warmup: false },
    { weight: 215, reps: 6, warmup: false },
  ]

  it('calls more reps than ever at a weight a rep PR', () => {
    expect(checkPr({ weight: 215, reps: 7 }, history)).toMatchObject({ repPr: true, previousBestReps: 6 })
  })

  it('compares against anything heavier too', () => {
    // 205 x 6 is no PR when 215 x 6 is on record.
    expect(checkPr({ weight: 205, reps: 6 }, history).repPr).toBe(false)
  })

  it('flags a new heaviest weight separately from rep PRs', () => {
    expect(checkPr({ weight: 235, reps: 1 }, history)).toMatchObject({ heaviest: true, repPr: false })
  })

  it('flags an e1RM PR', () => {
    // 225 x 5 is about 262.5; 235 x 4 is about 266.3.
    expect(checkPr({ weight: 235, reps: 4 }, history).e1rmPr).toBe(true)
    expect(checkPr({ weight: 235, reps: 2 }, history).e1rmPr).toBe(false)
  })

  it('ignores warm-ups', () => {
    const onlyWarmups = [{ weight: 45, reps: 10, warmup: true }]
    expect(checkPr({ weight: 45, reps: 5 }, onlyWarmups).firstTime).toBe(true)
  })

  it("doesn't badge the first time an exercise is logged", () => {
    expect(checkPr({ weight: 135, reps: 8 }, [])).toEqual({
      firstTime: true,
      heaviest: false,
      repPr: false,
      e1rmPr: false,
    })
  })
})

describe('failed sets', () => {
  const history = [
    { weight: 200, reps: 3, warmup: false },
    { weight: 225, reps: 0, warmup: false },
  ]

  it('are never a PR', () => {
    expect(checkPr({ weight: 230, reps: 0 }, history)).toMatchObject({ heaviest: false, repPr: false, e1rmPr: false })
  })

  it("don't stand in the way of a later one", () => {
    expect(checkPr({ weight: 215, reps: 1 }, history).heaviest).toBe(true)
  })
})
