// Six months of made-up training for one "Demo" profile, to check the
// Progress charts against in the dev preview. Only the dev build imports
// this; it never ships. The numbers are invented, nobody's real lifts.
import { findExercise } from '../data/exercises.ts'
import { findScheme } from '../data/schemes.ts'
import { planWeek } from '../engine/plan.ts'
import { defaultTable, increaseFor } from '../engine/progression.ts'
import { db as defaultDb, newId, type SetRow, type WigwamDb } from './db.ts'
import { createProfile, loadProgram } from './profiles.ts'

const DAY = 24 * 60 * 60 * 1000
const WEEKS = 26

/** A small seeded random source, so the demo comes out the same each time. */
function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Two accessories a day, each held for a few weeks before going up.
const ACCESSORIES: Record<string, { exerciseId: string; start: number; reps: [number, number] }[]> = {
  d1: [
    { exerciseId: 'db-row', start: 45, reps: [6, 10] },
    { exerciseId: 'face-pull', start: 30, reps: [15, 20] },
  ],
  d2: [
    { exerciseId: 'db-curl', start: 20, reps: [8, 12] },
    { exerciseId: 'db-rdl', start: 40, reps: [8, 12] },
  ],
  d3: [
    { exerciseId: 'db-lateral-raise', start: 15, reps: [15, 20] },
    { exerciseId: 'lat-pulldown', start: 100, reps: [8, 12] },
  ],
  d4: [
    { exerciseId: 'hammer-curl', start: 25, reps: [8, 12] },
    { exerciseId: 'cable-rear-delt-fly', start: 10, reps: [15, 20] },
  ],
}

/**
 * Each call adds another demo lifter ("Demo", "Demo 2", ...), lighter and
 * with their own luck, so comparisons have different lines to show.
 */
export async function loadDemo(db: WigwamDb = defaultDb, now = Date.now()): Promise<string> {
  const earlier = (await db.profiles.toArray()).filter((p) => p.name.startsWith('Demo')).length
  const rand = random(531 + earlier)
  const start = now - WEEKS * 7 * DAY
  const scale = (lb: number) => Math.round((lb * (1 - 0.15 * Math.min(earlier, 4))) / 5) * 5
  const tms: Record<string, number> = {
    'bench-press': scale(185),
    squat: scale(225),
    'overhead-press': scale(105),
    deadlift: scale(275),
  }
  const profileId = await createProfile(
    {
      name: earlier ? `Demo ${earlier + 1}` : 'Demo',
      color: '#c9ccd1',
      program: { kind: 'preset', presetId: 'nsuns-4day-row' },
      tms,
      ratingPreset: 'blank',
    },
    db,
    start,
  )
  const program = (await loadProgram(profileId, db))!

  await db.transaction('rw', [db.profiles, db.weeks, db.sessions, db.entries, db.sets, db.trainingMaxes, db.bodyweights], async () => {
    await db.profiles.update(profileId, { sex: 'male', advanced: true })
    let row = 135
    for (let w = 0; w < WEEKS; w++) {
      const weekStart = start + w * 7 * DAY
      const weekId = newId()
      const last = w === WEEKS - 1
      await db.weeks.add({
        id: weekId,
        profileId,
        number: w + 1,
        type: 'normal',
        startedAt: weekStart,
        ...(last ? {} : { endedAt: weekStart + 7 * DAY }),
        completedAt: weekStart + 6 * DAY,
        days: Object.fromEntries(program.days.map((d) => [d.id, 'done' as const])),
      })
      await db.bodyweights.add({ id: newId(), profileId, lb: Math.round((186 - w * 0.25 + (rand() - 0.5) * 2) * 2) / 2, at: weekStart })

      const days = planWeek(program, { weekType: 'normal', tms, workingWeights: { 'barbell-row': row }, schemes: findScheme })
      const starReps: Record<string, number> = {}
      for (const [d, day] of days.entries()) {
        const at = weekStart + d * 1.6 * DAY + 18 * 60 * 60 * 1000
        const sessionId = newId()
        const entryId = newId()
        const picks = (ACCESSORIES[day.dayId] ?? []).map((a) => ({
          id: newId(),
          exerciseId: a.exerciseId,
          sets: 3,
          reps: a.reps,
          // A step up every four weeks.
          weight: a.start + Math.floor(w / 4) * 5,
        }))
        await db.sessions.add({ id: sessionId, status: 'done', startedAt: at, endedAt: at + 75 * 60 * 1000, gymId: 'home', participants: [profileId], activeProfileId: profileId, rotate: false })
        await db.entries.add({
          id: entryId,
          sessionId,
          profileId,
          weekId,
          dayId: day.dayId,
          swaps: {},
          accessories: picks.map(({ id, exerciseId, sets, reps }) => ({ id, exerciseId, sets, reps })),
          status: 'done',
        })
        const sets: SetRow[] = []
        let clock = at
        for (const slot of day.mains) {
          for (const [index, planned] of slot.sets.entries()) {
            const tmId = slot.tmExerciseId ?? slot.exerciseId
            let reps = planned.repsMax ?? planned.reps
            if (planned.progression) {
              // Mostly 1-3 on the 1+ set, now and then more: a believable climb.
              const r = rand()
              reps = starReps[tmId] = r < 0.45 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : 4 + Math.floor(rand() * 2)
            } else if (planned.amrap) {
              reps = planned.reps + Math.floor(rand() * 4)
            } else if (rand() < 0.03) {
              reps = planned.reps - 1 // the odd missed rep
            }
            sets.push({
              id: newId(),
              profileId,
              sessionId,
              entryId,
              weekId,
              dayId: day.dayId,
              slotId: slot.slotId,
              index,
              role: 'main',
              exerciseId: slot.exerciseId,
              warmup: false,
              prescribedWeight: planned.weight,
              prescribedReps: planned.reps,
              prescribedRepsMax: planned.repsMax,
              pct: planned.pct,
              amrap: planned.amrap,
              progression: planned.progression,
              tmTest: planned.tmTest,
              tmExerciseId: slot.tmExerciseId,
              tm: slot.tm,
              weight: planned.weight ?? row,
              reps,
              at: (clock += 3 * 60 * 1000),
            })
          }
        }
        for (const pick of picks) {
          for (let index = 0; index < pick.sets; index++) {
            sets.push({
              id: newId(),
              profileId,
              sessionId,
              entryId,
              weekId,
              dayId: day.dayId,
              slotId: pick.id,
              index,
              role: 'accessory',
              exerciseId: pick.exerciseId,
              warmup: false,
              prescribedWeight: pick.weight,
              prescribedReps: pick.reps[0],
              prescribedRepsMax: pick.reps[1],
              amrap: false,
              progression: false,
              tmTest: false,
              weight: pick.weight,
              reps: pick.reps[1] - index - Math.floor(rand() * 2),
              at: (clock += 2 * 60 * 1000),
            })
          }
        }
        await db.sets.bulkAdd(sets)
      }

      if (w % 2 === 1) row += 5
      if (last) break
      // Start Week: each TM moves by its 1+ result, as the default tables say.
      for (const [exerciseId, reps] of Object.entries(starReps)) {
        const bump = increaseFor(reps, defaultTable(findExercise(exerciseId)?.region ?? 'upper'))
        if (!bump) continue
        tms[exerciseId] = (tms[exerciseId] ?? 0) + bump
        await db.trainingMaxes.add({ id: newId(), profileId, exerciseId, lb: tms[exerciseId]!, at: weekStart + 7 * DAY, reason: 'progression' })
      }
    }
  })
  return profileId
}
