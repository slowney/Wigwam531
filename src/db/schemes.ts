import { setCustomSchemes } from '../data/schemes.ts'
import type { Program, ProgramOverrides } from '../engine/program.ts'
import type { PercentSet, Scheme } from '../engine/schemes.ts'
import { db as defaultDb, newId, type WigwamDb } from './db.ts'

export async function syncCustomSchemes(db: WigwamDb = defaultDb): Promise<void> {
  setCustomSchemes(await db.schemes.toArray())
}

/** Throws a message worth showing if the scheme can't be run. */
export function validateScheme(s: Scheme): void {
  if (!s.name.trim()) throw new Error('Give the scheme a name.')
  if (s.kind === 'range') {
    if (!(s.sets >= 1 && s.reps[0] >= 1 && s.reps[0] <= s.reps[1])) {
      throw new Error('Sets and reps need to be at least 1, low end first.')
    }
    return
  }
  for (const sets of s.waves ?? [s.sets]) {
    if (sets.length === 0) throw new Error('Add at least one set.')
    if (sets.some((x: PercentSet) => !(x.pct >= 1 && x.pct <= 150) || !(x.reps >= 1))) {
      throw new Error('Each set needs 1–150% and at least one rep.')
    }
    if (sets.some((x) => x.repsMax !== undefined && !(x.repsMax >= x.reps))) {
      throw new Error('A rep range goes low end first, like 6-8.')
    }
    // Progression reads one 1+ set per TM a week; two in a slot would compete.
    if (sets.filter((x) => x.progression).length > 1) throw new Error('Only one set can drive the TM.')
  }
}

/** Saves a new scheme (no id) or replaces one. Edits change future plans only; history keeps what was prescribed. */
export async function saveScheme(scheme: Scheme | Omit<Scheme, 'id'>, db: WigwamDb = defaultDb, now = Date.now()): Promise<string> {
  const id =
    'id' in scheme && scheme.id
      ? scheme.id
      : `custom-scheme-${scheme.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 30)}-${newId().slice(0, 6)}`
  const full = { ...scheme, id, name: scheme.name.trim() } as Scheme
  validateScheme(full)
  const existing = await db.schemes.get(id)
  await db.schemes.put({ ...full, createdAt: existing?.createdAt ?? now })
  await syncCustomSchemes(db)
  return id
}

function usesScheme(program: Program | undefined, overrides: ProgramOverrides | undefined, id: string): boolean {
  if (program?.days.some((d) => d.mains.some((m) => m.schemeId === id))) return true
  return Object.values(overrides?.slots ?? {}).some((o) => o.schemeId === id)
}

/** Programs and saved programs that run this scheme, by name. Deleting waits until there are none. */
export async function schemeUsers(id: string, db: WigwamDb = defaultDb): Promise<string[]> {
  const users: string[] = []
  for (const row of await db.programs.toArray()) {
    if (usesScheme(row.program, row.overrides, id)) users.push((await db.profiles.get(row.profileId))?.name ?? 'Someone')
  }
  for (const t of await db.templates.toArray()) if (usesScheme(t, undefined, id)) users.push(t.name)
  return users
}

export async function deleteScheme(id: string, db: WigwamDb = defaultDb): Promise<void> {
  const users = await schemeUsers(id, db)
  if (users.length) throw new Error(`In use by ${users.join(', ')}. Change those lifts first.`)
  await db.schemes.delete(id)
  await syncCustomSchemes(db)
}
