import { describe, expect, it } from 'vitest'
import { HOME_GYM } from '../src/data/gym.ts'
import { canLoad, maxLoad, nextLoad, percentOf, roundWeight, tmFromOneRepMax } from '../src/engine/weights.ts'

describe('rounding', () => {
  it('rounds to the nearest 5 lb, halves up', () => {
    expect(roundWeight(213.75)).toBe(215)
    expect(roundWeight(191.25)).toBe(190)
    expect(roundWeight(202.5)).toBe(205)
  })

  it('can round down instead', () => {
    expect(roundWeight(213.75, { step: 5, mode: 'down' })).toBe(210)
    expect(roundWeight(205, { step: 5, mode: 'down' })).toBe(205)
  })

  it('takes exact halves of a TM the right way despite floating point', () => {
    expect(percentOf(225, 90)).toBe(205) // 202.5
    expect(percentOf(275, 90)).toBe(250) // 247.5
    expect(percentOf(150, 70)).toBe(105) // 0.7 * 150 is 104.999... in floats
  })

  it('sets a TM at 90% of a 1RM', () => {
    expect(tmFromOneRepMax(250)).toBe(225)
    expect(tmFromOneRepMax(405)).toBe(365) // 364.5
  })
})

describe('the garage plates', () => {
  const { plates } = HOME_GYM

  it('top out at 320 lb on the barbell', () => {
    expect(maxLoad(45, plates)).toBe(320)
    expect(canLoad(320, 45, plates)).toBe(true)
    expect(canLoad(325, 45, plates)).toBe(false)
  })

  it('make every 5 lb step from the empty bar to 320', () => {
    for (let w = 45; w <= 320; w += 5) expect(canLoad(w, 45, plates), `${w} lb`).toBe(true)
  })

  it("can't make a weight that needs plates smaller than 2.5", () => {
    expect(canLoad(47.5, 45, plates)).toBe(false)
    expect(canLoad(40, 45, plates)).toBe(false)
  })
})

describe('the next step up', () => {
  it('adds 5 lb to anything on a bar', () => {
    expect(nextLoad(165, 'barbell', HOME_GYM)).toBe(170)
    expect(nextLoad(60, 'ezBar', HOME_GYM)).toBe(65)
  })

  it('moves to the next pair of dumbbells, and stops at the 55s', () => {
    expect(nextLoad(35, 'dumbbell', HOME_GYM)).toBe(40)
    expect(nextLoad(55, 'dumbbell', HOME_GYM)).toBeUndefined()
  })

  it('moves one pin down the cable stack', () => {
    expect(nextLoad(50, 'cable', HOME_GYM)).toBe(60)
  })

  it('has no weight step for bodyweight work', () => {
    expect(nextLoad(0, 'bodyweight', HOME_GYM)).toBeUndefined()
  })
})
