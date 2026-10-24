import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { allExercises, findExercise } from '../../data/exercises.ts'
import { HOME_GYM } from '../../data/gym.ts'
import { findScheme } from '../../data/schemes.ts'
import { targetsFor } from '../../data/targets.ts'
import {
  db,
  type EntryRow,
  type ProfileRow,
  type RestrictionRow,
  type SessionRow,
  type SetRow,
  type WeekRow,
} from '../../db/db.ts'
import { loadRatings } from '../../db/library.ts'
import { makeSwapPermanent } from '../../db/programs.ts'
import { loadProgram, loadTms } from '../../db/profiles.ts'
import { loadRestrictions } from '../../db/restrictions.ts'
import { weekState } from '../../db/weeks.ts'
import {
  activeSession,
  addAccessory,
  deleteSets,
  discardSession,
  finishSession,
  logSet,
  logWarmups,
  removeAccessory,
  setActiveProfile,
  setCollapsed,
  setEntryNotes,
  setFromPlan,
  setRest,
  setRotate,
  setSlotWeight,
  swapExercise,
  updateAccessory,
  updateSet,
} from '../../db/sessions.ts'
import type { PlannedSet, PlannedSlot } from '../../engine/plan.ts'
import { dayLabel, type Program } from '../../engine/program.ts'
import type { PrCheck } from '../../engine/records.ts'
import {
  dayProgress,
  lastNotes,
  lastSessionSets,
  nextLifter,
  nextSet,
  planEntry,
  prChecks,
  prKind,
  restSeconds,
  slotCollapsed,
  type PrKind,
} from '../../engine/session.ts'
import {
  activeRestrictions,
  behind,
  fillSlots,
  focusExtras,
  restricts,
  type FocusState,
  type Gap,
  type SuggestInput,
} from '../../engine/suggest.ts'
import type { Exercise, Gym, Muscle, MuscleTargets, Rating, Restriction } from '../../engine/types.ts'
import { projectedWeek, type MuscleCounts } from '../../engine/volume.ts'
import { nextLoad, previousLoad } from '../../engine/weights.ts'
import { statusOf } from '../../engine/week.ts'
import { AccessoryPicker, gapText } from '../components/AccessoryPicker.tsx'
import { ExercisePicker } from '../components/ExercisePicker.tsx'
import { ConfirmButton, Stepper } from '../components/forms.tsx'
import { QuickAddSheet } from '../components/QuickAddSheet.tsx'
import { RatingSheet } from '../components/RatingSheet.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { RepPicker, SetEditor, type SetValues } from '../components/SetEditor.tsx'
import { formatDate, repRange } from '../format.ts'
import { useNow, useWakeLock } from '../hooks.ts'

interface Person {
  entry: EntryRow
  profile: ProfileRow
  followsProfileId?: string
  program?: Program
  tms: Record<string, number>
  week?: WeekRow
  history: SetRow[]
  ratings: Map<string, Rating>
  restrictions: RestrictionRow[]
  targets: MuscleTargets
}

export interface View {
  person: Person
  slots: PlannedSlot[]
  dayName: string
  /** This session's sets for this person. */
  logged: SetRow[]
  next?: { slotId: string; index: number }
  progress: { done: number; total: number }
  prs: Map<string, PrCheck>
  /** Open accessory slots on today's program day. */
  flexSlots: number
  /** Muscles projected to finish the week short. */
  gaps: Gap[]
  projected: MuscleCounts
  focus: FocusState
  restrictions: Restriction[]
  lastDone: Map<string, number>
  /** The next pending day, if it's hard on the lower back. */
  backDayNext?: string
}

async function loadSession(): Promise<{ session?: SessionRow; people: Person[]; gym?: Gym }> {
  const session = await activeSession()
  if (!session) return { people: [] }
  const entries = await db.entries.where('sessionId').equals(session.id).toArray()
  const people: Person[] = []
  for (const profileId of session.participants) {
    const entry = entries.find((e) => e.profileId === profileId)
    const profile = await db.profiles.get(profileId)
    if (!entry || !profile) continue
    people.push({
      entry,
      profile,
      followsProfileId: (await db.programs.get(profileId))?.followsProfileId,
      program: await loadProgram(profileId),
      tms: await loadTms(profileId),
      week: await db.weeks.get(entry.weekId),
      history: await db.sets.where('profileId').equals(profileId).toArray(),
      ratings: await loadRatings(profileId),
      restrictions: await loadRestrictions(profileId),
      targets: targetsFor(profile.muscleTargets),
    })
  }
  // The gym row is seeded on launch; the built-in one covers the gap if it's ever missing.
  return { session, people, gym: (await db.gyms.get(session.gymId)) ?? HOME_GYM }
}

function viewOf(person: Person, gym: Gym, now: number): View {
  const program = person.program
  const plan = (dayId: string, today: boolean) =>
    program &&
    planEntry({
      program,
      dayId,
      swaps: today ? person.entry.swaps : {},
      accessories: today ? person.entry.accessories : [],
      weekType: person.week?.type ?? 'normal',
      tms: person.tms,
      history: person.history,
      sessionId: person.entry.sessionId,
      gym,
      lookup: findExercise,
      schemes: findScheme,
    })
  const slots = plan(person.entry.dayId, true)?.slots ?? []
  const logged = person.history.filter((s) => s.entryId === person.entry.id)
  // Labelled from the program day, so a swap for today doesn't rename it.
  const programDay = program?.days.find((d) => d.id === person.entry.dayId)

  const otherPending = (program?.days ?? []).filter(
    (d) => d.id !== person.entry.dayId && (!person.week || statusOf(weekState(person.week), d.id) === 'pending'),
  )
  const weekSets = person.history.filter((s) => s.weekId === person.entry.weekId)
  const otherPlans = otherPending.flatMap((d) => plan(d.id, false)?.day ?? [])
  const projected = projectedWeek({
    loggedThisWeek: weekSets,
    today: slots,
    loggedToday: logged,
    otherPendingDays: otherPlans,
    lookup: findExercise,
  })
  // A focus counts accessory sets only, so the same projection without the main lifts.
  const focus: FocusState = {
    extras: focusExtras(person.profile.focuses ?? [], now),
    accessory: projectedWeek({
      loggedThisWeek: weekSets.filter((s) => s.role === 'accessory'),
      today: slots.filter((s) => s.role === 'accessory'),
      loggedToday: logged,
      otherPendingDays: otherPlans.map((d) => ({ ...d, mains: [] })),
      lookup: findExercise,
    }),
  }
  const lastDone = new Map<string, number>()
  for (const s of person.history) {
    if (!s.warmup && s.at > (lastDone.get(s.exerciseId) ?? 0)) lastDone.set(s.exerciseId, s.at)
  }
  const nextDay = otherPending[0]
  const hardOnBack = nextDay?.mains.some((m) => findExercise(m.exerciseId)?.lowerBack === 'high')

  return {
    person,
    slots,
    dayName: programDay ? dayLabel(programDay, findExercise) : 'Unknown day',
    logged,
    next: nextSet(slots, logged),
    progress: dayProgress(slots, logged),
    prs: prChecks(person.history),
    flexSlots: programDay?.accessories.filter((a) => a.kind === 'flex').length ?? 0,
    gaps: behind(projected, person.targets, focus),
    projected,
    focus,
    restrictions: activeRestrictions(person.restrictions, now),
    lastDone,
    backDayNext: nextDay && hardOnBack ? dayLabel(nextDay, findExercise) : undefined,
  }
}

/** The pieces of a suggestion request that don't change while the picker is open. */
export function suggestBase(view: View, gym: Gym): Omit<SuggestInput, 'only' | 'sort'> {
  return {
    exercises: allExercises(),
    ratings: view.person.ratings,
    equipment: new Set(gym.equipment),
    restrictions: view.restrictions,
    gaps: view.gaps,
    exclude: new Set(view.slots.map((s) => s.exerciseId)),
    lastDone: view.lastDone,
  }
}

// --- formatting -----------------------------------------------------------

const exerciseOf = (id: string): Exercise | undefined => findExercise(id)
const isBodyweight = (e?: Exercise) => e?.load === 'bodyweight' || e?.load === 'band'

function weightText(weight: number | undefined, exercise?: Exercise): string {
  if (weight === undefined) return '—'
  if (isBodyweight(exercise)) return weight > 0 ? `BW+${weight}` : 'BW'
  return String(weight)
}

function targetText(planned: PlannedSet, exercise?: Exercise): string {
  const unit = exercise?.unit === 'seconds' ? ' s' : ''
  if (planned.repsMax !== undefined) return `${planned.reps}–${planned.repsMax}${unit}`
  return `${planned.reps}${planned.amrap ? '+' : ''}${unit}`
}

const PR_LABEL: Record<PrKind, string> = { e1rm: 'PR', reps: 'Rep PR', heaviest: 'Heaviest' }

/** "Oct 14 · 35 × 12, 12, 10" for the last session that did this exercise. */
function lastTimeText(view: View, exerciseId: string): string | undefined {
  const sets = lastSessionSets(view.person.history, exerciseId, view.person.entry.sessionId)
  const first = sets[0]
  if (!first) return undefined
  const top = Math.max(...sets.map((s) => s.weight))
  const unit = exerciseOf(exerciseId)?.unit === 'seconds' ? ' s' : ''
  return `${formatDate(first.at)} · ${weightText(top, exerciseOf(exerciseId))} × ${sets.map((s) => s.reps).join(', ')}${unit}`
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * Seconds of rest left, or undefined if none is running. Capped at the full
 * rest, since the once-a-second clock can lag a set logged a moment ago.
 */
function restLeft(entry: EntryRow, now: number): number | undefined {
  if (entry.restEndsAt === undefined) return undefined
  const left = Math.max(0, Math.ceil((entry.restEndsAt - now) / 1000))
  return entry.restSeconds ? Math.min(left, entry.restSeconds) : left
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// --- screen ---------------------------------------------------------------

type SheetState =
  | { kind: 'edit'; profileId: string; slotId: string; index: number }
  /** With `short`, only up to the target: logging a failed set. */
  | { kind: 'reps'; profileId: string; slotId: string; index: number; short?: boolean }
  | { kind: 'swap'; profileId: string; slotId: string }
  | { kind: 'accessory'; profileId: string }
  | { kind: 'resize'; profileId: string; slotId: string }

interface Toast {
  text: string
  setIds: string[]
  entryId: string
  profileId: string
}

export function Session() {
  const navigate = useNavigate()
  const data = useLiveQuery(loadSession, [])
  const now = useNow(1000, Boolean(data?.session))
  const [sheet, setSheet] = useState<SheetState>()
  // Sheets that open over the picker, so closing them goes back to it.
  const [rateTarget, setRateTarget] = useState<{ profileId: string; exerciseId: string }>()
  const [quickAdd, setQuickAdd] = useState<{ profileId: string; name: string }>()
  const [shareWithFollowers, setShareWithFollowers] = useState(true)
  const [toast, setToast] = useState<Toast>()
  const [error, setError] = useState<string>()
  useWakeLock(Boolean(data?.session))

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  // Restrictions expire by the clock; checking when the data changes is often enough.
  const views = useMemo(
    () => (data?.gym ? data.people.map((p) => viewOf(p, data.gym!, Date.now())) : []),
    [data],
  )

  if (!data) return null
  const { session } = data
  if (!session) {
    return (
      <>
        <h1>Workout</h1>
        <p className="muted">No workout in progress.</p>
        <Link to="/workout" className="btn btn-big">
          Start a workout
        </Link>
      </>
    )
  }

  const order = views.map((v) => v.person.profile.id)
  const active = views.find((v) => v.person.profile.id === session.activeProfileId) ?? views[0]
  if (!active) return null
  const anyLogged = views.some((v) => v.logged.length > 0)

  const run = (work: () => Promise<unknown>) => {
    setError(undefined)
    work().catch((e: unknown) => setError((e as Error).message))
  }

  async function log(v: View, slot: PlannedSlot, index: number, planned: PlannedSet, values: SetValues) {
    const fresh = !v.logged.some((s) => !s.warmup && s.slotId === slot.slotId && s.index === index)
    const setId = await logSet(
      setFromPlan(v.person.entry, slot, index, planned, values),
      restSeconds(planned, slot.role),
    )
    const exercise = exerciseOf(slot.exerciseId)
    setToast({
      text: `${v.person.profile.name}: ${weightText(values.weight, exercise)} × ${values.reps}`,
      setIds: [setId],
      entryId: v.person.entry.id,
      profileId: v.person.profile.id,
    })
    if (!session!.rotate || views.length < 2) return
    const hasSetsLeft = (id: string) => {
      const other = views.find((x) => x.person.profile.id === id)
      if (!other) return false
      if (other !== v) return other.next !== undefined
      return other.progress.total - other.progress.done - (fresh ? 1 : 0) > 0
    }
    const next = nextLifter(order, v.person.profile.id, hasSetsLeft)
    if (next !== session!.activeProfileId) await setActiveProfile(session!.id, next)
  }

  async function undo(t: Toast) {
    setToast(undefined)
    await deleteSets(t.setIds)
    await setRest(t.entryId, undefined, undefined)
    await setActiveProfile(session!.id, t.profileId)
  }

  const sheetView = sheet ? views.find((v) => v.person.profile.id === sheet.profileId) : undefined
  const followersOf = (v: View) => views.filter((x) => x.person.followsProfileId === v.person.profile.id)
  const followers = followersOf(active)
  const share = shareWithFollowers && followers.length > 0
  // Pinned accessories come with the day; only picks fill its open slots.
  const picked = active.person.entry.accessories.filter((a) => !a.pinned).length
  const emptySlots = Math.max(0, active.flexSlots - picked)

  function renderSlot(slot: PlannedSlot) {
    return (
      <SlotCard
        key={slot.slotId}
        view={active!}
        slot={slot}
        weightStep={exerciseOf(slot.exerciseId)?.load === 'cable' ? data!.gym!.cableStep : 5}
        gym={data!.gym!}
        onNudge={(weight) => run(() => setSlotWeight(active!.person.entry.id, slot.slotId, weight))}
        onLog={(index, planned, values) => run(() => log(active!, slot, index, planned, values))}
        onSheet={(s) => setSheet(s)}
        onWarmups={(done) =>
          run(async () => {
            const existing = active!.logged.filter((s) => s.warmup && s.slotId === slot.slotId)
            if (done) await deleteSets(existing.map((s) => s.id))
            else
              await logWarmups(
                slot.warmups.map((w, i) =>
                  setFromPlan(active!.person.entry, slot, i, w, { weight: w.weight ?? 0, reps: w.reps }, true),
                ),
              )
          })
        }
        onUnswap={() => run(() => swapExercise(active!.person.entry.id, slot.slotId, undefined))}
        onPermanent={() => run(() => makeSwapPermanent(active!.person.entry.id, slot.slotId))}
        onRemove={() => run(() => removeAccessory(active!.person.entry.id, slot.slotId))}
        onToggle={(collapsed) => run(() => setCollapsed(active!.person.entry.id, slot.slotId, collapsed))}
      />
    )
  }

  async function fillAll(v: View) {
    const used = v.person.entry.accessories.flatMap((a) =>
      Object.entries(findExercise(a.exerciseId)?.muscles ?? {})
        .filter(([, w]) => w === 1)
        .map(([m]) => m as Muscle),
    )
    const picks = fillSlots(
      {
        ...suggestBase(v, data!.gym!),
        projected: v.projected,
        targets: v.person.targets,
        focus: v.focus,
        usedToday: used,
      },
      emptySlots,
    )
    if (picks.length === 0) throw new Error("Nothing's behind this week, so there's nothing to fill. Pick one by hand.")
    for (const e of picks) await addAccessory(v.person.entry.id, e.id, { forFollowers: share })
  }

  return (
    <div className="session">
      <div className="ptabs" role="tablist">
        {views.map((v) => {
          const on = v === active
          const left = restLeft(v.person.entry, now)
          return (
            <button
              key={v.person.profile.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={on ? 'ptab ptab-on' : 'ptab'}
              style={on ? { borderColor: v.person.profile.color } : undefined}
              onClick={() => run(() => setActiveProfile(session.id, v.person.profile.id))}
            >
              <span className="ptab-name">
                <span className="dot" style={{ background: v.person.profile.color }} />
                {v.person.profile.name}
              </span>
              <span className="small muted">
                {v.progress.done}/{v.progress.total}
                {left !== undefined && (left > 0 ? ` · ${mmss(left)}` : ' · ready')}
              </span>
            </button>
          )
        })}
      </div>

      <div className="session-head">
        <div className="grow">
          <strong>{active.dayName}</strong>
          <span className="muted small">
            {' '}
            · Week {active.person.week?.number ?? 1}
            {active.person.week?.type === 'deload' ? ' · Deload' : ''}
            {active.person.week?.type === 'tmTest' ? ' · TM test' : ''}
          </span>
        </div>
        {views.length > 1 && (
          <label className="toggle small">
            <input
              type="checkbox"
              checked={session.rotate}
              onChange={(e) => run(() => setRotate(session.id, e.target.checked))}
            />{' '}
            Rotate
          </label>
        )}
      </div>

      <RestBar entry={active.person.entry} now={now} onChange={(ends, secs) => run(() => setRest(active.person.entry.id, ends, secs))} />
      {error && <p className="error">{error}</p>}

      {active.slots.filter((s) => s.role === 'main').map(renderSlot)}

      <div className="acc-head">
        <h2 className="grow no-margin">Accessories</h2>
        {emptySlots > 0 && (
          <button type="button" className="btn btn-small" onClick={() => run(() => fillAll(active))}>
            Fill all
          </button>
        )}
      </div>
      {followers.length > 0 && (
        <label className="toggle small">
          <input type="checkbox" checked={shareWithFollowers} onChange={(e) => setShareWithFollowers(e.target.checked)} />{' '}
          Picks also go to {followers.map((f) => f.person.profile.name).join(' and ')}
        </label>
      )}
      {active.slots.filter((s) => s.role === 'accessory').map(renderSlot)}
      {Array.from({ length: emptySlots }, (_, i) => (
        <button
          key={i}
          type="button"
          className="slot-empty"
          onClick={() => setSheet({ kind: 'accessory', profileId: active.person.profile.id })}
        >
          <span className="grow">+ Choose accessory</span>
          {i === 0 && active.gaps[0] && <span className="muted small">{gapText(active.gaps[0])}</span>}
        </button>
      ))}
      {emptySlots === 0 && (
        <button
          type="button"
          className="btn btn-quiet add-accessory"
          onClick={() => setSheet({ kind: 'accessory', profileId: active.person.profile.id })}
        >
          + Add another
        </button>
      )}

      <NotesField key={active.person.entry.id} entry={active.person.entry} />

      <div className="session-foot">
        <ConfirmButton
          label="Finish workout"
          confirmLabel="Tap again to finish"
          onConfirm={() =>
            run(async () => {
              await finishSession(session.id)
              navigate(`/sessions/${session.id}`, { replace: true })
            })
          }
        />
        {!anyLogged && (
          <ConfirmButton
            label="Cancel workout"
            confirmLabel="Tap again to cancel"
            onConfirm={() =>
              run(async () => {
                await discardSession(session.id)
                navigate('/', { replace: true })
              })
            }
          />
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          <span className="grow">{toast.text}</span>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => run(() => undo(toast))}>
            Undo
          </button>
        </div>
      )}

      {sheet && sheetView && (
        <SessionSheet
          sheet={sheet}
          view={sheetView}
          views={views}
          gym={data.gym!}
          onClose={() => setSheet(undefined)}
          onLog={(slot, index, planned, values) => {
            setSheet(undefined)
            run(() => log(sheetView, slot, index, planned, values))
          }}
          onError={setError}
          share={shareWithFollowers && followersOf(sheetView).length > 0}
          onRate={(exerciseId) => setRateTarget({ profileId: sheetView.person.profile.id, exerciseId })}
          onQuickAdd={(name) => setQuickAdd({ profileId: sheetView.person.profile.id, name })}
        />
      )}

      {rateTarget && (
        <RatingSheet
          profileId={rateTarget.profileId}
          exerciseId={rateTarget.exerciseId}
          onClose={() => setRateTarget(undefined)}
        />
      )}

      {quickAdd && (
        <QuickAddSheet
          name={quickAdd.name}
          onClose={() => setQuickAdd(undefined)}
          onSaved={(exercise) => {
            const v = views.find((x) => x.person.profile.id === quickAdd.profileId)
            setQuickAdd(undefined)
            setSheet(undefined)
            if (v) {
              const forFollowers = shareWithFollowers && followersOf(v).length > 0
              run(() => addAccessory(v.person.entry.id, exercise.id, { forFollowers }))
            }
          }}
        />
      )}
    </div>
  )
}

function RestBar(props: {
  entry: EntryRow
  now: number
  onChange: (endsAt: number | undefined, seconds: number | undefined) => void
}) {
  const { restEndsAt, restSeconds: total } = props.entry
  if (restEndsAt === undefined) return null
  const left = restLeft(props.entry, props.now) ?? 0
  if (left === 0) {
    return (
      <button type="button" className="restbar restbar-ready" onClick={() => props.onChange(undefined, undefined)}>
        <strong className="grow">Rest's up. Go.</strong>
        <span className="small">Dismiss</span>
      </button>
    )
  }
  const pct = total ? Math.min(100, (left / total) * 100) : 0
  return (
    <div className="restbar" style={{ '--rest-left': `${pct}%` } as CSSProperties}>
      <span className="grow">
        <strong>Rest {mmss(left)}</strong> <span className="muted small">until {clock(restEndsAt)}</span>
      </span>
      <button type="button" className="btn btn-quiet btn-small" onClick={() => props.onChange(restEndsAt - 30_000, total)}>
        −30
      </button>
      <button type="button" className="btn btn-quiet btn-small" onClick={() => props.onChange(restEndsAt + 30_000, total)}>
        +30
      </button>
      <button type="button" className="btn btn-quiet btn-small" onClick={() => props.onChange(undefined, undefined)}>
        Skip
      </button>
    </div>
  )
}

function SlotCard(props: {
  view: View
  slot: PlannedSlot
  weightStep: number
  gym: Gym
  /** Today's weight for a rep-range exercise, before its next set. */
  onNudge: (weight: number) => void
  onLog: (index: number, planned: PlannedSet, values: SetValues) => void
  onSheet: (sheet: SheetState) => void
  onWarmups: (done: boolean) => void
  onUnswap: () => void
  onPermanent: () => void
  onRemove: () => void
  onToggle: (collapsed: boolean) => void
}) {
  const { view, slot } = props
  const profileId = view.person.profile.id
  const exercise = exerciseOf(slot.exerciseId)
  const here = view.logged.filter((s) => s.slotId === slot.slotId)
  const working = here.filter((s) => !s.warmup)
  const warmedUp = here.some((s) => s.warmup)
  const progress = dayProgress([slot], view.logged)
  const finished = progress.total > 0 && progress.done >= progress.total
  const collapsed = slotCollapsed(view.person.entry.collapsed?.[slot.slotId], progress)
  const programmed = view.person.program?.days
    .find((d) => d.id === view.person.entry.dayId)
    ?.mains.find((m) => m.id === slot.slotId)?.exerciseId
  const swappedFrom = slot.role === 'main' && programmed && programmed !== slot.exerciseId ? programmed : undefined
  const lastWeight = working.length ? working[working.length - 1]!.weight : undefined

  let meta = ''
  const pick = view.person.entry.accessories.find((a) => a.id === slot.slotId)
  if (slot.role === 'accessory') meta = pick?.pinned ? 'Pinned accessory' : 'Accessory'
  else if (slot.kind === 'range') meta = `${slot.tier}`
  else if (slot.missingTm) meta = `${slot.tier} · no TM entered`
  else {
    const borrowed = slot.tmExerciseId && slot.tmExerciseId !== slot.exerciseId ? `${exerciseOf(slot.tmExerciseId)?.name ?? ''} ` : ''
    meta = `${slot.tier} · ${borrowed}TM ${slot.tm}`
  }
  // Rep-range work says when it has moved up since last time, and why.
  const { carried } = slot
  if (carried?.reason === 'increase' && carried.weight !== undefined && carried.last !== undefined) {
    meta += ` · +${carried.weight - carried.last} from last time`
  }

  const doneLine = [...working]
    .sort((a, b) => a.index - b.index)
    .map((s) => `${weightText(s.weight, exercise)}×${s.reps}`)
    .join(' · ')
  const conflict = exercise ? view.restrictions.find((r) => restricts(r, exercise)) : undefined
  const lastNote = lastNotes(view.person.history, slot.exerciseId, view.person.entry.sessionId)

  return (
    <section className={collapsed ? 'card slot slot-collapsed' : 'card slot'}>
      <div className="slot-head">
        <button
          type="button"
          className="slot-toggle grow"
          aria-expanded={!collapsed}
          onClick={() => props.onToggle(!collapsed)}
        >
          <span className="chevron" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="grow stack">
            <strong>{exercise?.name ?? slot.exerciseId}</strong>
            <span className="muted small">
              {meta}
              {swappedFrom && ` · swapped from ${exerciseOf(swappedFrom)?.name ?? swappedFrom} today`}
            </span>
          </span>
          <span className={finished ? 'slot-count slot-count-done' : 'slot-count'}>
            {finished ? '✓ ' : ''}
            {progress.done}/{progress.total}
          </span>
        </button>
        {!collapsed && working.length === 0 && slot.role === 'main' && !swappedFrom && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => props.onSheet({ kind: 'swap', profileId, slotId: slot.slotId })}>
            Swap
          </button>
        )}
        {!collapsed && working.length === 0 && slot.role === 'accessory' && (
          <button type="button" className="btn btn-quiet btn-small" onClick={props.onRemove}>
            Remove
          </button>
        )}
      </div>

      {!collapsed && swappedFrom && (
        <div className="swap-row">
          {working.length === 0 && (
            <button type="button" className="btn btn-quiet btn-small" onClick={props.onUnswap}>
              Undo swap
            </button>
          )}
          <ConfirmButton small label="Make permanent" confirmLabel="Tap again to keep it" onConfirm={props.onPermanent} />
        </div>
      )}
      {!collapsed && pick && (
        <button
          type="button"
          className="btn btn-quiet btn-small swap-row"
          onClick={() => props.onSheet({ kind: 'resize', profileId, slotId: slot.slotId })}
        >
          {pick.sets} × {repRange(pick.reps)}
          {exercise?.unit === 'seconds' ? ' s' : ''} · Change
        </button>
      )}

      {!collapsed && lastNote && (
        <p className="small muted no-margin slot-note">
          ✎ Last time, {formatDate(lastNote.at)}: {lastNote.notes.join(' · ')}
        </p>
      )}
      {!collapsed && conflict && (
        <p className="small warn-text no-margin slot-warn">
          Goes against the {conflict.name.toLowerCase()} restriction.
          {working.length === 0 && slot.role === 'main' ? ' Swap it for today?' : ''}
        </p>
      )}
      {collapsed ? (
        <p className="slot-summary muted small">{doneLine || 'Nothing logged yet'}</p>
      ) : (
        <SlotBody {...props} exercise={exercise} working={working} warmedUp={warmedUp} lastWeight={lastWeight} />
      )}
    </section>
  )
}

function SlotBody(
  props: Parameters<typeof SlotCard>[0] & {
    exercise?: Exercise
    working: SetRow[]
    warmedUp: boolean
    lastWeight?: number
  },
) {
  const { view, slot, exercise, working, warmedUp, lastWeight } = props
  const profileId = view.person.profile.id
  const firstOpen = slot.sets.findIndex((_, i) => !working.some((s) => s.index === i))
  return (
    <>
      {slot.missingTm && (
        <p className="muted small">
          Set a {exerciseOf(slot.tmExerciseId ?? slot.exerciseId)?.name} TM on{' '}
          <Link to={`/profiles/${profileId}`}>{view.person.profile.name}'s profile</Link> to plan this lift.
        </p>
      )}

      {slot.warmups.length > 0 && (
        <button type="button" className={warmedUp ? 'warmups warmups-done' : 'warmups'} onClick={() => props.onWarmups(warmedUp)}>
          <span className="grow">
            {warmedUp ? '✓ ' : ''}Warm-up: {slot.warmups.map((w) => `${w.weight}×${w.reps}`).join(' · ')}
          </span>
          <span className="small">{warmedUp ? 'Undo' : 'Done'}</span>
        </button>
      )}

      {slot.sets.map((planned, index) => {
        const logged = working.find((s) => s.index === index)
        const isNext = view.next?.slotId === slot.slotId && view.next.index === index
        // Accessories get done whenever the bar's busy, so each one's next set
        // is ready to log out of order. The main lifts keep their order.
        const ready = isNext || (slot.role === 'accessory' && index === firstOpen)
        // A weight nudged with ± wins until a set is logged at it.
        const prefill =
          slot.kind === 'range' ? (view.person.entry.weights?.[slot.slotId] ?? lastWeight ?? planned.weight) : planned.weight
        const load = exercise?.load
        const nudge =
          ready && slot.kind === 'range' && prefill !== undefined && load
            ? { down: previousLoad(prefill, load, props.gym), up: nextLoad(prefill, load, props.gym) }
            : undefined
        return (
          <SetLine
            key={index}
            number={index + 1}
            planned={planned}
            logged={logged}
            current={ready}
            next={isNext}
            weight={prefill}
            exercise={exercise}
            pr={logged ? prKind(view.prs.get(logged.id)) : undefined}
            onQuick={(reps) =>
              prefill !== undefined &&
              props.onLog(index, planned, { weight: prefill, reps: reps ?? planned.repsMax ?? planned.reps })
            }
            onReps={() => props.onSheet({ kind: 'reps', profileId, slotId: slot.slotId, index })}
            onMissed={() => props.onSheet({ kind: 'reps', profileId, slotId: slot.slotId, index, short: true })}
            nudge={nudge && (nudge.down !== undefined || nudge.up !== undefined) ? { ...nudge, set: props.onNudge } : undefined}
            onEdit={() => props.onSheet({ kind: 'edit', profileId, slotId: slot.slotId, index })}
          />
        )
      })}
    </>
  )
}

// Past this, a row of rep buttons stops being quicker than the rep picker.
const MAX_QUICK_REPS = 10

function SetLine(props: {
  number: number
  planned: PlannedSet
  logged?: SetRow
  /** Ready to log: shows the log buttons. */
  current: boolean
  /** The person's next set overall, picked out more strongly. */
  next: boolean
  weight?: number
  exercise?: Exercise
  pr?: PrKind
  onQuick: (reps?: number) => void
  onReps: () => void
  /** Fewer reps than the target: a failed set. */
  onMissed: () => void
  /** One step lighter or heavier before logging (rep-range work). */
  nudge?: { down?: number; up?: number; set: (weight: number) => void }
  onEdit: () => void
}) {
  const { planned, logged, exercise } = props
  const flags = (
    <>
      {planned.progression && <span className="badge badge-star">1+</span>}
      {planned.tmTest && <span className="badge">test</span>}
      {planned.unloadable && <span className="badge badge-warn">over plate limit</span>}
    </>
  )

  if (logged) {
    const short = !planned.amrap && logged.reps < planned.reps
    return (
      <button type="button" className={short ? 'set set-done set-short' : 'set set-done'} onClick={props.onEdit}>
        <span className="set-num">✓</span>
        <span className="grow">
          <strong>
            {weightText(logged.weight, exercise)} × {logged.reps}
            {exercise?.unit === 'seconds' ? ' s' : ''}
          </strong>
          {logged.rpe !== undefined && <span className="muted"> @{logged.rpe}</span>}
          {logged.note && <span className="muted"> ✎</span>}
          {short && <span className="small warn-text"> of {targetText(planned, exercise)}</span>}
        </span>
        {flags}
        {props.pr && <span className="badge badge-pr">{PR_LABEL[props.pr]}</span>}
      </button>
    )
  }

  const label = (
    <>
      <span className="set-num">{props.number}</span>
      <span className="grow">
        {weightText(props.weight, exercise)} × {targetText(planned, exercise)}
      </span>
      {flags}
    </>
  )

  if (!props.current) {
    return (
      <button type="button" className="set set-pending" onClick={props.onEdit}>
        {label}
      </button>
    )
  }

  // Rep ranges get a button per rep count, one tap to log; timed holds don't.
  const quick =
    planned.repsMax !== undefined && exercise?.unit !== 'seconds'
      ? Array.from({ length: planned.repsMax - planned.reps + 1 }, (_, i) => planned.reps + i)
      : undefined
  let controls: ReactNode
  // Rep buttons too many to share the line with the set go on a line of their own.
  let below: ReactNode
  if (props.weight === undefined) {
    controls = (
      <button type="button" className="btn btn-small" onClick={props.onEdit}>
        Pick weight
      </button>
    )
  } else if (planned.amrap || (quick && quick.length > MAX_QUICK_REPS)) {
    controls = (
      <button type="button" className="btn log-btn" onClick={props.onReps}>
        Reps
      </button>
    )
  } else if (quick) {
    const buttons = (
      <span className="quick-reps">
        {quick.map((reps) => (
          <button key={reps} type="button" className="btn quick-rep" onClick={() => props.onQuick(reps)}>
            {reps}
          </button>
        ))}
      </span>
    )
    if (props.nudge) {
      // The weight's − / + take the line beside the set; reps go beneath.
      const { down, up, set } = props.nudge
      below = buttons
      controls = (
        <span className="nudge">
          <button
            type="button"
            className="btn btn-quiet nudge-btn"
            aria-label={down !== undefined ? `Lighter: ${down}` : 'Nothing lighter'}
            disabled={down === undefined}
            onClick={() => down !== undefined && set(down)}
          >
            −
          </button>
          <button
            type="button"
            className="btn btn-quiet nudge-btn"
            aria-label={up !== undefined ? `Heavier: ${up}` : 'Nothing heavier'}
            disabled={up === undefined}
            onClick={() => up !== undefined && set(up)}
          >
            +
          </button>
        </span>
      )
    } else if (quick.length > 3) below = buttons
    else controls = buttons
  } else {
    controls = (
      <>
        {exercise?.unit !== 'seconds' && (
          <button type="button" className="btn btn-quiet miss-btn" onClick={props.onMissed}>
            Missed
          </button>
        )}
        <button type="button" className="btn log-btn" aria-label="Log set as planned" onClick={() => props.onQuick()}>
          ✓
        </button>
      </>
    )
  }

  return (
    <div className={`set set-current${props.next ? '' : ' set-ready'}${below ? ' set-wide' : ''}`}>
      <button type="button" className="set-main" onClick={props.onEdit}>
        {label}
      </button>
      {controls}
      {below}
    </div>
  )
}

function NotesField({ entry }: { entry: EntryRow }) {
  const [text, setText] = useState(entry.notes ?? '')
  return (
    <div className="field notes">
      <label className="label" htmlFor="entry-notes">
        Notes for today
      </label>
      <textarea
        id="entry-notes"
        className="input textarea"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void setEntryNotes(entry.id, text.trim())}
      />
    </div>
  )
}

function SessionSheet(props: {
  sheet: SheetState
  view: View
  views: View[]
  gym: Gym
  onClose: () => void
  onLog: (slot: PlannedSlot, index: number, planned: PlannedSet, values: SetValues) => void
  onError: (message: string) => void
  /** Accessory picks also go to this person's followers in the session. */
  share: boolean
  onRate: (exerciseId: string) => void
  onQuickAdd: (name: string) => void
}) {
  const { sheet, view } = props
  const entry = view.person.entry
  const inPlan = new Set(view.slots.map((s) => s.exerciseId))
  const hidden = new Set([...view.person.ratings.values()].filter((r) => r.hidden).map((r) => r.exerciseId))

  if (sheet.kind === 'accessory') {
    return (
      <AccessoryPicker
        title={`Accessory for ${view.person.profile.name}`}
        base={suggestBase(view, props.gym)}
        lastTime={(exerciseId) => lastTimeText(view, exerciseId)}
        backDayNext={view.backDayNext}
        onClose={props.onClose}
        onPick={(exerciseId) => {
          props.onClose()
          addAccessory(entry.id, exerciseId, { forFollowers: props.share }).catch((e: unknown) =>
            props.onError((e as Error).message),
          )
        }}
        onRate={props.onRate}
        onAdd={props.onQuickAdd}
      />
    )
  }

  const slot = view.slots.find((s) => s.slotId === sheet.slotId)
  if (!slot) return null
  const exercise = exerciseOf(slot.exerciseId)

  if (sheet.kind === 'swap') {
    return (
      <ExercisePicker
        title={`Swap ${exercise?.name ?? ''} for today`}
        hidden={hidden}
        exclude={inPlan}
        onClose={props.onClose}
        onPick={(exerciseId) => {
          props.onClose()
          swapExercise(entry.id, slot.slotId, exerciseId).catch((e: unknown) => props.onError((e as Error).message))
        }}
      />
    )
  }

  if (sheet.kind === 'resize') {
    const pick = entry.accessories.find((a) => a.id === slot.slotId)
    if (!pick) return null
    return (
      <AccessorySizeSheet
        title={exercise?.name ?? slot.exerciseId}
        sets={pick.sets}
        reps={pick.reps}
        seconds={exercise?.unit === 'seconds'}
        onClose={props.onClose}
        onSave={(sets, reps) => updateAccessory(entry.id, pick.id, { sets, reps }).then(props.onClose)}
      />
    )
  }

  const planned = slot.sets[sheet.index]
  if (!planned) return null
  const working = view.logged.filter((s) => s.slotId === slot.slotId && !s.warmup)
  const logged = working.find((s) => s.index === sheet.index)
  const lastWeight = working.length ? working[working.length - 1]!.weight : undefined
  const prefill = slot.kind === 'range' ? (entry.weights?.[slot.slotId] ?? lastWeight ?? planned.weight) : planned.weight
  const title = `${exercise?.name ?? ''} · set ${sheet.index + 1}`

  if (sheet.kind === 'reps' && prefill !== undefined) {
    return (
      <RepPicker
        title={title}
        target={`${weightText(prefill, exercise)} × ${targetText(planned, exercise)}`}
        low={planned.reps}
        high={planned.repsMax}
        max={sheet.short ? planned.reps : undefined}
        onClose={props.onClose}
        onPick={(reps) => props.onLog(slot, sheet.index, planned, { weight: prefill, reps })}
      />
    )
  }

  return (
    <SetEditor
      title={title}
      target={`${weightText(planned.weight, exercise)} × ${targetText(planned, exercise)}`}
      weight={logged?.weight ?? prefill}
      reps={logged?.reps ?? planned.repsMax ?? planned.reps}
      rpe={logged?.rpe}
      note={logged?.note}
      weightStep={exercise?.load === 'cable' ? props.gym.cableStep : 5}
      bodyweight={isBodyweight(exercise)}
      seconds={exercise?.unit === 'seconds'}
      saveLabel={logged ? 'Save' : 'Log set'}
      onClose={props.onClose}
      onSave={(values) => {
        if (!logged) return props.onLog(slot, sheet.index, planned, values)
        props.onClose()
        updateSet(logged.id, values).catch((e: unknown) => props.onError((e as Error).message))
      }}
      onDelete={
        logged
          ? () => {
              props.onClose()
              deleteSets([logged.id]).catch((e: unknown) => props.onError((e as Error).message))
            }
          : undefined
      }
    />
  )
}

/** Today's sets × reps for an accessory. Whatever's chosen is where it starts next time too. */
function AccessorySizeSheet(props: {
  title: string
  sets: number
  reps: [number, number]
  seconds: boolean
  onSave: (sets: number, reps: [number, number]) => Promise<void>
  onClose: () => void
}) {
  const [sets, setSets] = useState(props.sets)
  const [low, setLow] = useState(props.reps[0])
  const [high, setHigh] = useState(props.reps[1])
  const [error, setError] = useState<string>()
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <div className="counts counts-spaced">
        <Stepper label="Sets" value={sets} min={1} max={10} onChange={setSets} />
        <Stepper
          label={props.seconds ? 'Seconds from' : 'Reps from'}
          value={low}
          min={1}
          onChange={(n) => {
            setLow(n)
            if (n > high) setHigh(n)
          }}
        />
        <Stepper label="to" value={high} min={low} onChange={setHigh} />
      </div>
      <p className="muted small">Next time this accessory comes up, it starts at this too.</p>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button
          type="button"
          className="btn grow"
          onClick={() => props.onSave(sets, [low, high]).catch((e: unknown) => setError((e as Error).message))}
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}
