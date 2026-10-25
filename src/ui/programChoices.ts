import { PRESETS } from '../data/presets.ts'
import type { TemplateRow } from '../db/db.ts'
import type { Program } from '../engine/program.ts'

// The programs a profile can start on or switch to, shared by New profile
// and Switch program so the two offer the same things in the same words.

export const PRESET_BLURBS: Record<string, string> = {
  'nsuns-4day': 'Bench, squat, OHP and deadlift days, each with its T2.',
  'nsuns-4day-row': 'The same four days, plus a heavy barbell row on Day 1.',
  '531-bbb-4day': '5/3/1: OHP, deadlift, bench and squat days. 5s, 3s and 5/3/1 weeks, then 5 × 10 at 50% of the same lift.',
  '531-bbs-4day': "5/3/1 with 10 × 5 at the first set's percentage after the main sets. More strength, less volume than BBB.",
}

/** Someone running their own program: a leader to follow, or a program to copy. */
export interface Leader {
  id: string
  name: string
  program: Program
}

export interface ProgramOption {
  value: string
  title: string
  description?: string
}

const daysText = (p: Program) => `${p.days.length} ${p.days.length === 1 ? 'day' : 'days'}`

export function programOptions(args: {
  leaders: ReadonlyArray<Leader>
  templates: ReadonlyArray<TemplateRow>
  /** Offer following each leader. */
  follow: boolean
  /** Offer a copy of each leader's program. */
  copy: boolean
}): ProgramOption[] {
  return [
    ...(args.follow
      ? args.leaders.map((l) => ({
          value: `follow:${l.id}`,
          title: `Follow ${l.name}`,
          description: `Same days and lifts as ${l.name}, with your own TMs. You can still change single lifts just for you.`,
        }))
      : []),
    ...PRESETS.map((p) => ({ value: `preset:${p.id}`, title: p.name, description: PRESET_BLURBS[p.id] })),
    ...args.templates.map((t) => ({ value: `template:${t.id}`, title: t.name, description: `My programs · ${daysText(t)}` })),
    ...(args.copy
      ? args.leaders.map((l) => ({
          value: `copy:${l.id}`,
          title: `A copy of ${l.name}'s`,
          description: `${l.program.name}, yours to change. ${l.name}'s later changes don't reach it.`,
        }))
      : []),
    { value: 'blank', title: 'Build my own', description: 'Empty days, filled in with lifts in the program editor.' },
  ]
}

/** The program an option copies, for presets, saved programs and copies. */
export function optionProgram(
  value: string,
  leaders: ReadonlyArray<Leader>,
  templates: ReadonlyArray<TemplateRow>,
): Program | undefined {
  const [kind, id] = value.split(':')
  if (kind === 'preset') return PRESETS.find((p) => p.id === id)
  if (kind === 'template') return templates.find((t) => t.id === id)
  if (kind === 'copy' || kind === 'follow') return leaders.find((l) => l.id === id)?.program
  return undefined
}
