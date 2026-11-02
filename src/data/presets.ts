import type { AccessorySlot, MainSlot, Program, ProgramDay, Tier } from '../engine/program.ts'

// Slot ids are stable forever: followers' overrides and logged sets refer
// to them. New slots get new ids; old ids are never reused.

function main(id: string, exerciseId: string, tier: Tier, schemeId: string, tmExerciseId?: string): MainSlot {
  return { id, exerciseId, tier, schemeId, ...(tmExerciseId ? { tmExerciseId } : {}), warmups: tier === 'T1' }
}

/** Three open accessory slots, filled at the workout. Nothing is pinned by default. */
function flex(dayId: string): AccessorySlot[] {
  return [1, 2, 3].map((n) => ({ id: `${dayId}-a${n}`, kind: 'flex' }))
}

function day(id: string, name: string, mains: MainSlot[]): ProgramDay {
  return { id, name, mains, accessories: flex(id) }
}

export const NSUNS_4DAY: Program = {
  id: 'nsuns-4day',
  name: 'nSuns 4-day',
  days: [
    day('d1', 'Day 1', [
      main('d1-t1', 'bench-press', 'T1', 'nsuns-t1-bench'),
      main('d1-t2', 'overhead-press', 'T2', 'nsuns-t2-ohp'),
    ]),
    day('d2', 'Day 2', [
      main('d2-t1', 'squat', 'T1', 'nsuns-t1-squat'),
      main('d2-t2', 'sumo-deadlift', 'T2', 'nsuns-t2-sumo', 'deadlift'),
    ]),
    day('d3', 'Day 3', [
      main('d3-t1', 'overhead-press', 'T1', 'nsuns-t1-ohp'),
      main('d3-t2', 'incline-bench-press', 'T2', 'nsuns-t2-incline', 'bench-press'),
    ]),
    day('d4', 'Day 4', [
      main('d4-t1', 'deadlift', 'T1', 'nsuns-t1-deadlift'),
      main('d4-t2', 'front-squat', 'T2', 'nsuns-t2-front-squat', 'squat'),
    ]),
  ],
}

// The heavy row goes on Day 1: opposite muscles to bench, a fresh lower
// back, and two sessions before deadlifts.
export const NSUNS_4DAY_ROW: Program = {
  id: 'nsuns-4day-row',
  name: 'nSuns 4-day + heavy row',
  days: NSUNS_4DAY.days.map((d) =>
    d.id === 'd1' ? { ...d, mains: [...d.mains, main('d1-t3', 'barbell-row', 'T3', 'range-4x6-8')] } : d,
  ),
}

/**
 * 5/3/1, four days (bench, squat, OHP, deadlift): the 5s/3s/5/3/1 wave on
 * each day's lift, then supplemental work on the same lift. Upper and lower
 * days alternate, and squat and deadlift sit at opposite ends of the week.
 */
function fiveThreeOne(id: string, name: string, supplemental: string): Program {
  // Day ids stay with their lift from when OHP came first, so an id never
  // names a different lift: order and "Day N" are all that moved.
  const lifts = [
    { dayId: 'd3', exerciseId: 'bench-press' },
    { dayId: 'd4', exerciseId: 'squat' },
    { dayId: 'd1', exerciseId: 'overhead-press' },
    { dayId: 'd2', exerciseId: 'deadlift' },
  ]
  return {
    id,
    name,
    days: lifts.map(({ dayId, exerciseId }, i) => {
      return day(dayId, `Day ${i + 1}`, [
        main(`${dayId}-t1`, exerciseId, 'T1', '531-main'),
        { ...main(`${dayId}-t2`, exerciseId, 'T2', supplemental), warmups: false, alternates: SUPPLEMENTAL_ALTERNATES[exerciseId] },
      ])
    }),
  }
}

// Wendler's substitutes for the supplemental lift, as far as the garage
// allows. Dumbbell ones run the same sets and reps at a weight you pick.
const SUPPLEMENTAL_ALTERNATES: Record<string, string[]> = {
  'overhead-press': ['db-overhead-press', 'db-shoulder-press', 'incline-bench-press', 'db-incline-press'],
  'bench-press': ['db-bench-press', 'db-incline-press', 'incline-bench-press', 'close-grip-bench-press', 'floor-press'],
  squat: ['front-squat', 'heels-elevated-squat'],
  deadlift: ['trap-bar-deadlift', 'deficit-deadlift', 'stiff-leg-deadlift'],
}

export const FIVE_THREE_ONE_BBB = fiveThreeOne('531-bbb-4day', '5/3/1 BBB 4-day', '531-bbb')
export const FIVE_THREE_ONE_BBS = fiveThreeOne('531-bbs-4day', '5/3/1 BBS 4-day', '531-bbs')

export const PRESETS: Program[] = [NSUNS_4DAY, NSUNS_4DAY_ROW, FIVE_THREE_ONE_BBB, FIVE_THREE_ONE_BBS]
