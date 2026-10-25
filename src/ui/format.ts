import type { ProgramDay } from '../engine/program.ts'
import type { PercentSet, Scheme } from '../engine/schemes.ts'
import type { ExerciseLookup } from '../engine/types.ts'

export function formatDate(ms: number, now = Date.now()): string {
  const date = new Date(ms)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "8–12", or just "5" when there's no range. */
export function repRange(reps: readonly [number, number]): string {
  return reps[0] === reps[1] ? `${reps[0]}` : `${reps[0]}–${reps[1]}`
}

/** A scheme in a few words: "9 sets, 65–95% · ★ 95%", or "4 × 6–8". */
export function schemeSummary(scheme: Scheme): string {
  if (scheme.kind === 'range') return `${scheme.sets} × ${repRange(scheme.reps)}`
  if (scheme.waves?.length) {
    const names = scheme.waveNames ?? scheme.waves.map((_, i) => `week ${i + 1}`)
    return `${scheme.waves.length}-week wave: ${names.join(', ')}`
  }
  const pcts = scheme.sets.map((s) => s.pct)
  const low = Math.min(...pcts)
  const high = Math.max(...pcts)
  const star = scheme.sets.find((s) => s.progression)
  const count = `${scheme.sets.length} ${scheme.sets.length === 1 ? 'set' : 'sets'}`
  return `${count}, ${low === high ? low : `${low}–${high}`}%${star ? ` · ★ ${star.pct}%` : ''}`
}

/** One percent set: "95% × 1+". */
export function percentSetText(set: PercentSet): string {
  return `${set.pct}% × ${set.reps}${set.amrap ? '+' : ''}`
}

/** "Face pull + 2 open slots": a day's accessories as planned. */
export function accessoryText(day: ProgramDay, lookup: ExerciseLookup): string {
  const pinned = day.accessories.flatMap((a) => (a.kind === 'pinned' ? [lookup(a.exerciseId)?.name ?? a.exerciseId] : []))
  const open = day.accessories.filter((a) => a.kind === 'flex').length
  return [...pinned, ...(open ? [`${open} open ${open === 1 ? 'slot' : 'slots'}`] : [])].join(' + ') || 'None'
}

/** "+6%", "−3%": a change, signed. */
export function percentText(fraction: number): string {
  const pct = Math.round(fraction * 100)
  return `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`
}

/** "+4", "−5": a difference in pounds, signed. */
export function signed(n: number): string {
  const r = Math.round(n)
  return `${r >= 0 ? '+' : '−'}${Math.abs(r)}`
}
