import Dexie, { type EntityTable } from 'dexie'

// The only module that touches IndexedDB. The engine never imports this;
// screens read through it and hand plain objects to the engine.

export interface Setting {
  key: string
  value: unknown
}

export type WigwamDb = Dexie & {
  settings: EntityTable<Setting, 'key'>
}

export function openDb(name = 'wigwam531'): WigwamDb {
  const db = new Dexie(name) as WigwamDb
  // Versions only ever add tables or indexes. Never edit a shipped version;
  // add a new one below it.
  db.version(1).stores({ settings: 'key' })
  return db
}

export const db = openDb()

export async function getSetting<T>(key: string, fallback: T, from: WigwamDb = db): Promise<T> {
  const row = await from.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown, to: WigwamDb = db): Promise<void> {
  await to.settings.put({ key, value })
}

export async function bumpCounter(key: string, to: WigwamDb = db): Promise<number> {
  return to.transaction('rw', to.settings, async () => {
    const next = (await getSetting(key, 0, to)) + 1
    await setSetting(key, next, to)
    return next
  })
}

// iOS can evict storage for sites it thinks are unused. A home-screen app
// is usually granted persistence; this asks, and reports what it got.
export async function requestPersistence(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function isPersisted(): Promise<boolean | undefined> {
  if (!navigator.storage?.persisted) return undefined
  return navigator.storage.persisted()
}
