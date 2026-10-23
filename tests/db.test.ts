import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { bumpCounter, getSetting, openDb } from '../src/db/db.ts'

describe('settings store', () => {
  it('keeps a value across closing and reopening the database', async () => {
    const first = openDb('test-reopen')
    await bumpCounter('taps', first)
    await bumpCounter('taps', first)
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
