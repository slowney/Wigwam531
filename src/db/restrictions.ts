import type { RestrictionRule } from '../data/restrictionPresets.ts'
import { db as defaultDb, newId, type RestrictionRow, type WigwamDb } from './db.ts'

export async function addRestriction(
  profileId: string,
  rule: RestrictionRule,
  until: number | undefined,
  db: WigwamDb = defaultDb,
  now = Date.now(),
): Promise<string> {
  const id = newId()
  await db.restrictions.add({ ...rule, id, profileId, createdAt: now, ...(until !== undefined ? { until } : {}) })
  return id
}

export async function removeRestriction(id: string, db: WigwamDb = defaultDb): Promise<void> {
  await db.restrictions.delete(id)
}

/** All of them, expired ones included; the engine decides what's in force. */
export async function loadRestrictions(profileId: string, db: WigwamDb = defaultDb): Promise<RestrictionRow[]> {
  return (await db.restrictions.where('profileId').equals(profileId).toArray()).sort((a, b) => a.createdAt - b.createdAt)
}
