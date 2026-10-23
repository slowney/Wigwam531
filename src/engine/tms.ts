/** A TM as it was set at some moment. History is kept; the latest one is current. */
export interface TmEntry {
  exerciseId: string
  lb: number
  /** Epoch ms. */
  at: number
}

export function currentTms(history: ReadonlyArray<TmEntry>): Record<string, number> {
  const latest: Record<string, TmEntry> = {}
  for (const entry of history) {
    const seen = latest[entry.exerciseId]
    if (!seen || entry.at >= seen.at) latest[entry.exerciseId] = entry
  }
  return Object.fromEntries(Object.entries(latest).map(([id, e]) => [id, e.lb]))
}
