export type Tier = 'T1' | 'T2' | 'T3'

export interface MainSlot {
  /** Stable for the life of the program; followers' overrides key on it. */
  id: string
  exerciseId: string
  tier: Tier
  schemeId: string
  /**
   * Whose TM the percentages use, when it isn't the lift's own. nSuns T2s
   * borrow: incline runs off the bench TM, sumo off the deadlift TM.
   */
  tmExerciseId?: string
  warmups: boolean
}

export type AccessorySlot =
  | { id: string; kind: 'flex' }
  | { id: string; kind: 'pinned'; exerciseId: string }

export interface ProgramDay {
  id: string
  name: string
  mains: MainSlot[]
  accessories: AccessorySlot[]
}

export interface Program {
  id: string
  name: string
  days: ProgramDay[]
}

/**
 * What a follower changes about the leader's program. Only the fields that
 * differ are stored, so the leader's later edits to anything else still
 * flow through.
 */
export interface ProgramOverrides {
  slots: Record<string, Partial<Omit<MainSlot, 'id'>>>
}

export function slotTmId(slot: MainSlot): string {
  return slot.tmExerciseId ?? slot.exerciseId
}

/**
 * A follower's effective program: the leader's, with their overrides laid
 * on top. Overrides for slots the leader has since deleted are ignored
 * rather than resurrected.
 */
export function resolveProgram(base: Program, overrides?: ProgramOverrides): Program {
  if (!overrides) return base
  return {
    ...base,
    days: base.days.map((day) => ({
      ...day,
      mains: day.mains.map((slot) => ({ ...slot, ...overrides.slots[slot.id], id: slot.id })),
    })),
  }
}
