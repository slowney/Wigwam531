import { describe, expect, it } from 'vitest'
import { loadDemo } from '../src/db/demo.ts'
import { loadTms } from '../src/db/profiles.ts'
import { e1rmSeries, tmSteps } from '../src/engine/metrics.ts'
import { freshDb } from './helpers.ts'

describe('demo data for the preview', () => {
  it('is six months of training with moving TMs', async () => {
    const db = freshDb()
    const now = Date.UTC(2026, 9, 24)
    const id = await loadDemo(db, now)
    expect(await db.sessions.count()).toBe(26 * 4)
    expect(await db.weeks.count()).toBe(26)
    const sets = await db.sets.where('profileId').equals(id).toArray()
    expect(e1rmSeries(sets, 'bench-press')).toHaveLength(26) // one bench day a week
    const tms = await loadTms(id, db)
    expect(tms['squat']).toBeGreaterThan(225)
    expect(tmSteps(await db.trainingMaxes.toArray(), 'squat').length).toBeGreaterThan(5)
    expect(Math.min(...sets.map((s) => s.at))).toBeGreaterThan(now - 27 * 7 * 24 * 60 * 60 * 1000)
  })
})
