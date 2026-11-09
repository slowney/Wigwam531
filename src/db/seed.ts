import { HOME_GYM } from '../data/gym.ts'
import { db as defaultDb, type WigwamDb } from './db.ts'

const OLD_CABLE_STEP = 10

/**
 * First-run data. Runs on every launch and only fills gaps, because a phone
 * upgrading from an older version never gets Dexie's populate event.
 */
export async function ensureSeeded(db: WigwamDb = defaultDb): Promise<void> {
  await db.transaction('rw', db.gyms, async () => {
    const home = await db.gyms.get(HOME_GYM.id)
    if (!home) await db.gyms.add(structuredClone(HOME_GYM))
    // The cable stack moves in 5s, not the 10s first shipped. Nothing could
    // set the step by hand back then, so a 10 here is the old default.
    else if (home.cableStep === OLD_CABLE_STEP) await db.gyms.update(HOME_GYM.id, { cableStep: HOME_GYM.cableStep })
  })
}
