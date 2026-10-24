import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { HOME_GYM } from '../../data/gym.ts'
import { findScheme } from '../../data/schemes.ts'
import { db, type EntryRow, type ProfileRow, type SessionRow, type SetRow, type WeekRow } from '../../db/db.ts'
import { loadProgram, loadTms } from '../../db/profiles.ts'
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
  swapExercise,
  updateSet,
} from '../../db/sessions.ts'
import type { PlannedSet, PlannedSlot } from '../../engine/plan.ts'
import { dayLabel, type Program } from '../../engine/program.ts'
import type { PrCheck } from '../../engine/records.ts'
import {
  dayProgress,
  nextLifter,
  nextSet,
  planEntry,
  prChecks,
  prKind,
  restSeconds,
  slotCollapsed,
  type PrKind,
} from '../../engine/session.ts'
import type { Exercise, Gym } from '../../engine/types.ts'
import { ExercisePicker } from '../components/ExercisePicker.tsx'
import { ConfirmButton } from '../components/forms.tsx'
import { RepPicker, SetEditor, type SetValues } from '../components/SetEditor.tsx'
import { useNow, useWakeLock } from '../hooks.ts'

interface Person {
  entry: EntryRow
  profile: ProfileRow
  followsProfileId?: string
  program?: Program
  tms: Record<string, number>
  week?: WeekRow
  history: SetRow[]
  hidden: Set<string>
}

interface View {
  person: Person
  slots: PlannedSlot[]
  dayName: string
  /** This session's sets for this person. */
  logged: SetRow[]
  next?: { slotId: string; index: number }
  progress: { done: number; total: number }
  prs: Map<string, PrCheck>
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
    const ratings = await db.ratings.where('profileId').equals(profileId).toArray()
    people.push({
      entry,
      profile,
      followsProfileId: (await db.programs.get(profileId))?.followsProfileId,
      program: await loadProgram(profileId),
      tms: await loadTms(profileId),
      week: await db.weeks.get(entry.weekId),
      history: await db.sets.where('profileId').equals(profileId).toArray(),
      hidden: new Set(ratings.filter((r) => r.hidden).map((r) => r.exerciseId)),
    })
  }
  // The gym row is seeded on launch; the built-in one covers the gap if it's ever missing.
  return { session, people, gym: (await db.gyms.get(session.gymId)) ?? HOME_GYM }
}

function viewOf(person: Person, gym: Gym): View {
  const plan =
    person.program &&
    planEntry({
      program: person.program,
      dayId: person.entry.dayId,
      swaps: person.entry.swaps,
      accessories: person.entry.accessories,
      weekType: person.week?.type ?? 'normal',
      tms: person.tms,
      history: person.history,
      sessionId: person.entry.sessionId,
      gym,
      lookup: findExercise,
      schemes: findScheme,
    })
  const slots = plan?.slots ?? []
  const logged = person.history.filter((s) => s.entryId === person.entry.id)
  // Labelled from the program day, so a swap for today doesn't rename it.
  const programDay = person.program?.days.find((d) => d.id === person.entry.dayId)
  return {
    person,
    slots,
    dayName: programDay ? dayLabel(programDay, findExercise) : 'Unknown day',
    logged,
    next: nextSet(slots, logged),
    progress: dayProgress(slots, logged),
    prs: prChecks(person.history),
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
  | { kind: 'reps'; profileId: string; slotId: string; index: number }
  | { kind: 'swap'; profileId: string; slotId: string }
  | { kind: 'accessory'; profileId: string }

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
  const [toast, setToast] = useState<Toast>()
  const [error, setError] = useState<string>()
  useWakeLock(Boolean(data?.session))

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  const views = useMemo(
    () => (data?.gym ? data.people.map((p) => viewOf(p, data.gym!)) : []),
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

      {active.slots.map((slot) => (
        <SlotCard
          key={slot.slotId}
          view={active}
          slot={slot}
          weightStep={exerciseOf(slot.exerciseId)?.load === 'cable' ? data.gym!.cableStep : 5}
          onLog={(index, planned, values) => run(() => log(active, slot, index, planned, values))}
          onSheet={(s) => setSheet(s)}
          onWarmups={(done) =>
            run(async () => {
              const existing = active.logged.filter((s) => s.warmup && s.slotId === slot.slotId)
              if (done) await deleteSets(existing.map((s) => s.id))
              else
                await logWarmups(
                  slot.warmups.map((w, i) =>
                    setFromPlan(active.person.entry, slot, i, w, { weight: w.weight ?? 0, reps: w.reps }, true),
                  ),
                )
            })
          }
          onUnswap={() => run(() => swapExercise(active.person.entry.id, slot.slotId, undefined))}
          onRemove={() => run(() => removeAccessory(active.person.entry.id, slot.slotId))}
          onToggle={(collapsed) => run(() => setCollapsed(active.person.entry.id, slot.slotId, collapsed))}
        />
      ))}

      <button
        type="button"
        className="btn btn-quiet add-accessory"
        onClick={() => setSheet({ kind: 'accessory', profileId: active.person.profile.id })}
      >
        + Add accessory
      </button>

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
  onLog: (index: number, planned: PlannedSet, values: SetValues) => void
  onSheet: (sheet: SheetState) => void
  onWarmups: (done: boolean) => void
  onUnswap: () => void
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
  if (slot.role === 'accessory') meta = 'Accessory'
  else if (slot.kind === 'range') meta = `${slot.tier}`
  else if (slot.missingTm) meta = `${slot.tier} · no TM entered`
  else {
    const borrowed = slot.tmExerciseId && slot.tmExerciseId !== slot.exerciseId ? `${exerciseOf(slot.tmExerciseId)?.name ?? ''} ` : ''
    meta = `${slot.tier} · ${borrowed}TM ${slot.tm}`
  }

  const doneLine = [...working]
    .sort((a, b) => a.index - b.index)
    .map((s) => `${weightText(s.weight, exercise)}×${s.reps}`)
    .join(' · ')

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
        {!collapsed && working.length === 0 && swappedFrom && (
          <button type="button" className="btn btn-quiet btn-small" onClick={props.onUnswap}>
            Undo swap
          </button>
        )}
        {!collapsed && working.length === 0 && slot.role === 'accessory' && (
          <button type="button" className="btn btn-quiet btn-small" onClick={props.onRemove}>
            Remove
          </button>
        )}
      </div>

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
        const prefill = slot.kind === 'range' ? (lastWeight ?? planned.weight) : planned.weight
        return (
          <SetLine
            key={index}
            number={index + 1}
            planned={planned}
            logged={logged}
            current={isNext}
            weight={prefill}
            exercise={exercise}
            pr={logged ? prKind(view.prs.get(logged.id)) : undefined}
            onQuick={(reps) =>
              prefill !== undefined &&
              props.onLog(index, planned, { weight: prefill, reps: reps ?? planned.repsMax ?? planned.reps })
            }
            onReps={() => props.onSheet({ kind: 'reps', profileId, slotId: slot.slotId, index })}
            onEdit={() => props.onSheet({ kind: 'edit', profileId, slotId: slot.slotId, index })}
          />
        )
      })}
    </>
  )
}

function SetLine(props: {
  number: number
  planned: PlannedSet
  logged?: SetRow
  current: boolean
  weight?: number
  exercise?: Exercise
  pr?: PrKind
  onQuick: (reps?: number) => void
  onReps: () => void
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
      <button type="button" className="set set-done" onClick={props.onEdit}>
        <span className="set-num">✓</span>
        <span className="grow">
          <strong>
            {weightText(logged.weight, exercise)} × {logged.reps}
            {exercise?.unit === 'seconds' ? ' s' : ''}
          </strong>
          {logged.rpe !== undefined && <span className="muted"> @{logged.rpe}</span>}
          {logged.note && <span className="muted"> ✎</span>}
          {short && <span className="muted small"> of {targetText(planned, exercise)}</span>}
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

  const range = planned.repsMax !== undefined && exercise?.unit !== 'seconds' ? planned.repsMax - planned.reps : undefined
  let controls
  if (props.weight === undefined) {
    controls = (
      <button type="button" className="btn btn-small" onClick={props.onEdit}>
        Pick weight
      </button>
    )
  } else if (planned.amrap || (range !== undefined && range > 4)) {
    controls = (
      <button type="button" className="btn log-btn" onClick={props.onReps}>
        Reps
      </button>
    )
  } else if (range !== undefined) {
    controls = (
      <span className="quick-reps">
        {Array.from({ length: range + 1 }, (_, i) => planned.reps + i).map((reps) => (
          <button key={reps} type="button" className="btn quick-rep" onClick={() => props.onQuick(reps)}>
            {reps}
          </button>
        ))}
      </span>
    )
  } else {
    controls = (
      <button type="button" className="btn log-btn" aria-label="Log set as planned" onClick={() => props.onQuick()}>
        ✓
      </button>
    )
  }

  return (
    <div className="set set-current">
      <button type="button" className="set-main" onClick={props.onEdit}>
        {label}
      </button>
      {controls}
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
}) {
  const { sheet, view } = props
  const [forFollowers, setForFollowers] = useState(true)
  const entry = view.person.entry
  const inPlan = new Set(view.slots.map((s) => s.exerciseId))

  if (sheet.kind === 'accessory') {
    const followers = props.views.filter((v) => v.person.followsProfileId === view.person.profile.id)
    return (
      <ExercisePicker
        title={`Accessory for ${view.person.profile.name}`}
        hidden={view.person.hidden}
        exclude={inPlan}
        onClose={props.onClose}
        onPick={(exerciseId) => {
          props.onClose()
          addAccessory(entry.id, exerciseId, { forFollowers: forFollowers && followers.length > 0 }).catch((e: unknown) =>
            props.onError((e as Error).message),
          )
        }}
        footer={
          followers.length > 0 && (
            <label className="toggle followers-toggle">
              <input type="checkbox" checked={forFollowers} onChange={(e) => setForFollowers(e.target.checked)} /> Also add
              for {followers.map((f) => f.person.profile.name).join(' and ')}
            </label>
          )
        }
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
        hidden={view.person.hidden}
        exclude={inPlan}
        onClose={props.onClose}
        onPick={(exerciseId) => {
          props.onClose()
          swapExercise(entry.id, slot.slotId, exerciseId).catch((e: unknown) => props.onError((e as Error).message))
        }}
      />
    )
  }

  const planned = slot.sets[sheet.index]
  if (!planned) return null
  const working = view.logged.filter((s) => s.slotId === slot.slotId && !s.warmup)
  const logged = working.find((s) => s.index === sheet.index)
  const lastWeight = working.length ? working[working.length - 1]!.weight : undefined
  const prefill = slot.kind === 'range' ? (lastWeight ?? planned.weight) : planned.weight
  const title = `${exercise?.name ?? ''} · set ${sheet.index + 1}`

  if (sheet.kind === 'reps' && prefill !== undefined) {
    return (
      <RepPicker
        title={title}
        target={`${weightText(prefill, exercise)} × ${targetText(planned, exercise)}`}
        low={planned.reps}
        high={planned.repsMax}
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
