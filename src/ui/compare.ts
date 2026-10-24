// Who's in a comparison, and which colour each has. A person keeps their
// slot (and so their colour) while others come and go: a chart shouldn't
// repaint someone because someone else was added.

/** Three colours stay tellable apart on every pair, colour-blind included; a fourth doesn't. */
export const MAX_COMPARED = 3

/** Slots in order; an empty slot is ''. */
export type Slots = string[]

export function parseSlots(param: string | null): Slots {
  return (param ?? '').split(',').slice(0, MAX_COMPARED)
}

export function formatSlots(slots: Slots): string {
  // Trailing empty slots carry no meaning.
  const out = [...slots]
  while (out.length && !out[out.length - 1]) out.pop()
  return out.join(',')
}

export const compared = (slots: Slots) => slots.filter(Boolean)

/** Adds someone to the first free slot, or takes them out. Full means unchanged. */
export function toggleSlot(slots: Slots, id: string): Slots {
  const at = slots.indexOf(id)
  if (at >= 0) return slots.map((s, i) => (i === at ? '' : s))
  const out = Array.from({ length: MAX_COMPARED }, (_, i) => slots[i] ?? '')
  const free = out.indexOf('')
  if (free < 0) return slots
  out[free] = id
  return out
}
