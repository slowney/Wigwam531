import { HOME_GYM } from '../data/gym.ts'
import { db as defaultDb, type WigwamDb } from './db.ts'

/**
 * First-run data. Runs on every launch and only fills gaps, because a phone
 * upgrading from an older version never gets Dexie's populate event.
 */
export async function ensureSeeded(db: WigwamDb = defaultDb): Promise<void> {
  await db.transaction('rw', db.gyms, async () => {
    if (!(await db.gyms.get(HOME_GYM.id))) await db.gyms.add(structuredClone(HOME_GYM))
  })
}
