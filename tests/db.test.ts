import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { HOME_GYM } from '../src/data/gym.ts'
import { getSetting, openDb, setSetting } from '../src/db/db.ts'
import { ensureSeeded } from '../src/db/seed.ts'

describe('settings store', () => {
  it('keeps a value across closing and reopening the database', async () => {
    const first = openDb('test-reopen')
    await setSetting('taps', 2, first)
    first.close()

    const second = openDb('test-reopen')
    expect(await getSetting('taps', 0, second)).toBe(2)
    second.close()
  })

  it('returns the fallback for a key that was never set', async () => {
    const fresh = openDb('test-fallback')
    expect(await getSetting('missing', 'default', fresh)).toBe('default')
    fresh.close()
  })
})

describe('upgrading the phone from Phase 0', () => {
  it('keeps settings, drops the tap counter and seeds the Home gym', async () => {
    // Exactly what Phase 0 shipped: version 1, settings only.
    const v1 = new Dexie('test-upgrade')
    v1.version(1).stores({ settings: 'key' })
    await v1.table('settings').bulkPut([
      { key: 'phase0.counter', value: 7 },
      { key: 'keep', value: 'me' },
    ])
    v1.close()

    const v2 = openDb('test-upgrade')
    await ensureSeeded(v2)
    expect(await getSetting('keep', null, v2)).toBe('me')
    expect(await getSetting('phase0.counter', null, v2)).toBeNull()
    expect(await v2.gyms.get('home')).toEqual(HOME_GYM)
    v2.close()
  })
})
