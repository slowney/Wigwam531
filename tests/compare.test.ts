import { describe, expect, it } from 'vitest'
import { compared, formatSlots, parseSlots, toggleSlot } from '../src/ui/compare.ts'

describe('comparing people', () => {
  it('keeps everyone in their slot as others come and go', () => {
    let slots = toggleSlot(parseSlots('lead'), 'alex')
    slots = toggleSlot(slots, 'jo')
    expect(slots).toEqual(['lead', 'alex', 'jo'])
    slots = toggleSlot(slots, 'alex')
    expect(slots).toEqual(['lead', '', 'jo'])
    expect(compared(slots)).toEqual(['lead', 'jo'])
    // The next person takes the free slot, so Jo's colour doesn't change.
    expect(toggleSlot(slots, 'sam')).toEqual(['lead', 'sam', 'jo'])
  })

  it('stops at three', () => {
    expect(toggleSlot(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c'])
  })

  it('round-trips through the address', () => {
    expect(formatSlots(['lead', '', 'jo'])).toBe('lead,,jo')
    expect(formatSlots(['lead', '', ''])).toBe('lead')
    expect(parseSlots('lead,,jo')).toEqual(['lead', '', 'jo'])
  })
})
