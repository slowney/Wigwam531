import { describe, expect, it } from 'vitest'
import { NSUNS_4DAY, NSUNS_4DAY_ROW } from '../src/data/presets.ts'
import { findScheme } from '../src/data/schemes.ts'
import { requiredTms } from '../src/engine/program.ts'
import { currentTms } from '../src/engine/tms.ts'

describe('current TMs', () => {
  it('takes the latest entry for each lift', () => {
    const history = [
      { exerciseId: 'bench-press', lb: 225, at: 1 },
      { exerciseId: 'squat', lb: 275, at: 1 },
      { exerciseId: 'bench-press', lb: 230, at: 5 },
      { exerciseId: 'bench-press', lb: 220, at: 3 },
    ]
    expect(currentTms(history)).toEqual({ 'bench-press': 230, squat: 275 })
  })
})

describe('TMs a program needs', () => {
  it('lists the four nSuns lifts, not the T2s that borrow them', () => {
    expect(requiredTms(NSUNS_4DAY, findScheme)).toEqual(['bench-press', 'overhead-press', 'squat', 'deadlift'])
  })

  it('leaves out the heavy row, which runs off a working weight', () => {
    expect(requiredTms(NSUNS_4DAY_ROW, findScheme)).toEqual(requiredTms(NSUNS_4DAY, findScheme))
  })
})
