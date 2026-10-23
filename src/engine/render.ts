// Plain-text rendering of a planned week. The pinned test fixture is
// rendered with this, and so is `npm run week`, so it has to stay readable
// enough to check line by line against the nSuns app.
import type { PlannedDay, PlannedSet, PlannedSlot, WeekType } from './plan.ts'
import type { Program } from './program.ts'
import type { ExerciseLookup } from './types.ts'

const WEEK_LABEL: Record<WeekType, string> = {
  normal: 'normal week',
  deload: 'deload week',
  tmTest: 'TM-test week',
}

function setText(s: PlannedSet): string {
  const reps = s.repsMax !== undefined ? `${s.reps}-${s.repsMax}` : `${s.reps}${s.amrap ? '+' : ''}`
  let text = `${s.weight ?? '?'}x${reps}`
  if (s.progression) text = `[${text}]`
  if (s.tmTest) text += ' (test)'
  if (s.unloadable) text += '!'
  return text
}

function slotLines(slot: PlannedSlot, lookup: ExerciseLookup): string[] {
  const name = lookup(slot.exerciseId)?.name ?? slot.exerciseId

  if (slot.kind === 'range') {
    const first = slot.sets[0]
    const shape = first ? `${slot.sets.length} x ${first.reps}${first.repsMax ? `-${first.repsMax}` : ''}` : 'no sets'
    const weight = first?.weight === undefined ? 'pick a starting weight' : `@ ${first.weight}${first.unloadable ? '!' : ''}`
    return [`  ${name} - ${slot.tier} - ${shape} ${weight}`]
  }

  if (slot.missingTm) return [`  ${name} - ${slot.tier} - no TM entered yet`]

  const borrowed =
    slot.tmExerciseId && slot.tmExerciseId !== slot.exerciseId
      ? `${lookup(slot.tmExerciseId)?.name ?? slot.tmExerciseId} `
      : ''
  const lines = [`  ${name} - ${slot.tier} - ${borrowed}TM ${slot.tm}`]
  if (slot.warmups.length) lines.push(`    warm-up: ${slot.warmups.map(setText).join(', ')}`)
  lines.push(`    sets:    ${slot.sets.map(setText).join(', ')}`)
  return lines
}

function accessoryLine(day: PlannedDay, lookup: ExerciseLookup): string {
  const open = day.accessories.filter((a) => a.kind === 'flex').length
  const pinned = day.accessories.flatMap((a) =>
    a.kind === 'pinned' ? [lookup(a.exerciseId)?.name ?? a.exerciseId] : [],
  )
  const parts = []
  if (pinned.length) parts.push(pinned.join(', '))
  if (open) parts.push(`${open} open ${open === 1 ? 'slot' : 'slots'}`)
  return `  Accessories: ${parts.join(' + ') || 'none'}`
}

export function renderDays(days: ReadonlyArray<PlannedDay>, lookup: ExerciseLookup): string {
  const lines: string[] = []
  for (const day of days) {
    lines.push(day.name.toUpperCase())
    for (const slot of day.mains) lines.push(...slotLines(slot, lookup))
    lines.push(accessoryLine(day, lookup), '')
  }
  return lines.join('\n')
}

export function weekReport(args: {
  program: Program
  weekType: WeekType
  tms: Readonly<Record<string, number>>
  days: ReadonlyArray<PlannedDay>
  lookup: ExerciseLookup
}): string {
  const tmList = Object.entries(args.tms)
    .map(([id, tm]) => `${args.lookup(id)?.name ?? id} ${tm}`)
    .join(', ')
  const anyUnloadable = args.days.some((d) =>
    d.mains.some((m) => m.sets.some((s) => s.unloadable)),
  )
  const header = [
    `${args.program.name}, ${WEEK_LABEL[args.weekType]}`,
    `TMs: ${tmList}`,
    'Weights round to the nearest 5 lb. [Brackets] mark the 1+ set that sets next week\'s TM.',
  ]
  if (anyUnloadable) header.push('! = more than the plates can load.')
  return [...header, '', renderDays(args.days, args.lookup)].join('\n')
}
