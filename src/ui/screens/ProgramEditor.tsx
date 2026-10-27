import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { findScheme } from '../../data/schemes.ts'
import { db, newId, type ProfileRow } from '../../db/db.ts'
import { loadRatings } from '../../db/library.ts'
import { loadProgram, loadTms } from '../../db/profiles.ts'
import { editProgram, overrideSlot, saveTemplate, unfollow } from '../../db/programs.ts'
import {
  DAY_FOCUS_LABELS,
  dayFocus,
  slotTmId,
  type DayFocus,
  type MainSlot,
  type Program,
  type ProgramDay,
  type ProgramOverrides,
  type Tier,
} from '../../engine/program.ts'
import {
  addDay,
  addMainSlot,
  addPinned,
  MAX_DAYS,
  MAX_FLEX,
  MAX_MAINS,
  moveDay,
  moveMainSlot,
  newMainSlot,
  overrideDiff,
  removeAccessorySlot,
  removeDay,
  removeGroup,
  removeMainSlot,
  renameDay,
  renameProgram,
  setDayFocus,
  setFlexSlots,
  updateMainSlot,
} from '../../engine/programEdit.ts'
import { ExercisePicker } from '../components/ExercisePicker.tsx'
import { BackLink, ConfirmButton, Segmented, Stepper } from '../components/forms.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { SlotSheet } from '../components/SlotSheet.tsx'
import { SwitchProgramSheet } from '../components/SwitchProgramSheet.tsx'
import { accessoryText, schemeSummary } from '../format.ts'
import { Icon } from '../icons.tsx'

type Tms = Readonly<Record<string, number>>

type SheetState =
  | { kind: 'slot'; slotId: string }
  /** Picking the lift first, then the rest of it. */
  | { kind: 'add'; dayId: string; exerciseId?: string }
  | { kind: 'pin'; dayId: string }
  | { kind: 'switch' }
  | { kind: 'save' }

const nameOf = (id: string) => findExercise(id)?.name ?? id

// What each accessory focus does to suggestions, in a line.
const FOCUS_HELP: Record<DayFocus, string> = {
  upper: 'Suggestions lean to chest, shoulders, back and arms.',
  lower: 'Suggestions lean to legs and abs.',
  posterior: 'Suggestions lean to hamstrings, glutes and back/pull work, sparing the lower back the deadlift already worked.',
  full: 'Suggestions follow whatever is furthest behind for the week.',
}
const TIER_BY_POSITION: Tier[] = ['T1', 'T2', 'T3']

function names(list: string[]): string {
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/** "T2 · nSuns T2 incline · Bench TM", flagging a TM that hasn't been entered. */
function SlotMeta({ slot, tms }: { slot: MainSlot; tms: Tms }) {
  const scheme = findScheme(slot.schemeId)
  const how = scheme ? (scheme.kind === 'range' ? `${schemeSummary(scheme)} reps` : scheme.name) : slot.schemeId
  if (scheme?.kind !== 'percent') return <span className="muted small">{`${slot.tier} · ${how}`}</span>
  const tmId = slotTmId(slot)
  const missing = tms[tmId] === undefined
  const borrowed = tmId !== slot.exerciseId ? ` · ${findExercise(tmId)?.short ?? nameOf(tmId)} TM` : ''
  return (
    <span className="muted small">
      {`${slot.tier} · ${how}${borrowed}`}
      {missing && <span className="warn-text"> · no TM yet</span>}
    </span>
  )
}

function MoveButtons(props: { label: string; first: boolean; last: boolean; onMove: (delta: -1 | 1) => void }) {
  return (
    <span className="move-buttons">
      <button
        type="button"
        className="btn btn-quiet step"
        aria-label={`Move ${props.label} up`}
        disabled={props.first}
        onClick={() => props.onMove(-1)}
      >
        <Icon name="up" />
      </button>
      <button
        type="button"
        className="btn btn-quiet step"
        aria-label={`Move ${props.label} down`}
        disabled={props.last}
        onClick={() => props.onMove(1)}
      >
        <Icon name="down" />
      </button>
    </span>
  )
}


type NoticeState = { text: string; error?: boolean }

/** A message at the bottom of the screen: why an edit was refused, or that something saved. Good news fades. */
function useNotice() {
  const [notice, setNotice] = useState<NoticeState>()
  useEffect(() => {
    if (!notice || notice.error) return
    const timer = setTimeout(() => setNotice(undefined), 4000)
    return () => clearTimeout(timer)
  }, [notice])
  const view = notice && (
    <div className="toast" role={notice.error ? 'alert' : 'status'}>
      <span className={notice.error ? 'grow error' : 'grow'}>{notice.text}</span>
      <button type="button" className="btn btn-quiet btn-small" onClick={() => setNotice(undefined)}>
        OK
      </button>
    </div>
  )
  return [view, setNotice] as const
}

export function ProgramEditor() {
  const { id = '' } = useParams()
  const data = useLiveQuery(async () => {
    const profile = await db.profiles.get(id)
    if (!profile) return { profile }
    const row = await db.programs.get(id)
    const leaderRow = row?.followsProfileId ? await db.programs.get(row.followsProfileId) : undefined
    const followerNames: string[] = []
    for (const f of await db.programs.where('followsProfileId').equals(id).toArray()) {
      const p = await db.profiles.get(f.profileId)
      if (p && !p.archived) followerNames.push(p.name)
    }
    const ratings = await loadRatings(id)
    return {
      profile,
      overrides: row?.overrides,
      follows: Boolean(row?.followsProfileId),
      program: await loadProgram(id),
      leader: row?.followsProfileId ? await db.profiles.get(row.followsProfileId) : undefined,
      leaderProgram: leaderRow?.program,
      followerNames,
      tms: await loadTms(id),
      hidden: new Set([...ratings.values()].filter((r) => r.hidden).map((r) => r.exerciseId)),
    }
  }, [id])
  if (!data) return null

  const { profile, program } = data
  if (!profile || !program) {
    return (
      <>
        <BackLink to="/profiles" label="Profiles" />
        <p className="muted">No program to show.</p>
      </>
    )
  }
  const common = { profile, program, tms: data.tms ?? {}, hidden: data.hidden ?? new Set<string>() }
  return data.follows && data.leaderProgram ? (
    <FollowedProgram {...common} leader={data.leader} leaderProgram={data.leaderProgram} overrides={data.overrides} />
  ) : (
    <OwnProgram {...common} followerNames={data.followerNames ?? []} />
  )
}

interface ViewProps {
  profile: ProfileRow
  program: Program
  tms: Tms
  hidden: ReadonlySet<string>
}

function OwnProgram(props: ViewProps & { followerNames: string[] }) {
  const { profile, program, tms } = props
  const [sheet, setSheet] = useState<SheetState>()
  const [notice, setNotice] = useNotice()
  const [renaming, setRenaming] = useState<string>()
  const hasTm = (exerciseId: string) => tms[exerciseId] !== undefined

  /** Rejects with the reason when the edit is refused; `edit` shows it instead. */
  const change = (fn: (p: Program) => Program) => editProgram(profile.id, fn)
  const edit = (fn: (p: Program) => Program) => {
    setNotice(undefined)
    change(fn).catch((e: unknown) => setNotice({ text: (e as Error).message, error: true }))
  }
  const close = () => setSheet(undefined)

  return (
    <>
      <BackLink to={`/profiles/${profile.id}`} label={profile.name} />
      <h1>Program</h1>

      <section className="card">
        {renaming !== undefined ? (
          <div className="row">
            <input
              className="input grow"
              value={renaming}
              autoFocus
              aria-label="Program name"
              onChange={(e) => setRenaming(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                edit((p) => renameProgram(p, renaming))
                setRenaming(undefined)
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <div className="row">
            <strong className="grow">{program.name}</strong>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setRenaming(program.name)}>
              Rename
            </button>
          </div>
        )}
        <p className="muted small no-margin">
          Changes reach the days still to do this week straight away. Sets already logged keep what they were.
        </p>
        {props.followerNames.length > 0 && (
          <p className="muted small">
            {names(props.followerNames)} {props.followerNames.length === 1 ? 'follows' : 'follow'} this program and get
            your changes too, apart from lifts they've changed for themselves.
          </p>
        )}
      </section>

      {program.days.map((day, i) => (
        <DayCard
          key={day.id}
          day={day}
          index={i}
          count={program.days.length}
          tms={tms}
          onEdit={edit}
          onSheet={setSheet}
        />
      ))}

      <button
        type="button"
        className="btn btn-quiet btn-wide"
        disabled={program.days.length >= MAX_DAYS}
        onClick={() => edit((p) => addDay(p, newId))}
      >
        + Add a day
      </button>

      <section className="card">
        <h2>Whole program</h2>
        <div className="actions no-top">
          <button type="button" className="btn btn-quiet grow" onClick={() => setSheet({ kind: 'switch' })}>
            Switch program…
          </button>
          <button type="button" className="btn btn-quiet grow" onClick={() => setSheet({ kind: 'save' })}>
            Save to My programs
          </button>
        </div>
      </section>

      {sheet?.kind === 'slot' &&
        (() => {
          const slot = program.days.flatMap((d) => d.mains).find((m) => m.id === sheet.slotId)
          if (!slot) return null
          return (
            <SlotSheet
              title={nameOf(slot.exerciseId)}
              initial={slot}
              tms={tms}
              hidden={props.hidden}
              onClose={close}
              onSave={(fields) => change((p) => updateMainSlot(p, slot.id, fields)).then(close)}
              onRemove={() => change((p) => removeMainSlot(p, slot.id)).then(close)}
            />
          )
        })()}

      {sheet?.kind === 'add' &&
        (() => {
          const day = program.days.find((d) => d.id === sheet.dayId)
          if (!day) return null
          if (!sheet.exerciseId) {
            return (
              <ExercisePicker
                title={`Main lift for ${day.name}`}
                hidden={props.hidden}
                exclude={new Set(day.mains.map((m) => m.exerciseId))}
                onClose={close}
                onPick={(exerciseId) => setSheet({ ...sheet, exerciseId })}
              />
            )
          }
          const tier = TIER_BY_POSITION[day.mains.length] ?? 'T3'
          return (
            <SlotSheet
              title={`Add to ${day.name}`}
              initial={newMainSlot(sheet.exerciseId, tier, hasTm, findExercise)}
              tms={tms}
              hidden={props.hidden}
              saveLabel={`Add to ${day.name}`}
              onClose={close}
              onSave={(fields) => change((p) => addMainSlot(p, day.id, fields, newId)).then(close)}
            />
          )
        })()}

      {sheet?.kind === 'pin' &&
        (() => {
          const day = program.days.find((d) => d.id === sheet.dayId)
          if (!day) return null
          const pinned = day.accessories.flatMap((a) => (a.kind === 'pinned' ? [a.exerciseId] : []))
          return (
            <ExercisePicker
              title={`Pin to ${day.name}`}
              hidden={props.hidden}
              exclude={new Set([...pinned, ...day.mains.map((m) => m.exerciseId)])}
              onClose={close}
              onPick={(exerciseId) => {
                close()
                edit((p) => addPinned(p, day.id, exerciseId, newId))
              }}
            />
          )
        })()}

      {sheet?.kind === 'switch' && (
        <SwitchProgramSheet
          profileId={profile.id}
          profileName={profile.name}
          hasFollowers={props.followerNames.length > 0}
          onClose={close}
        />
      )}

      {sheet?.kind === 'save' && (
        <SaveTemplateSheet
          program={program}
          onClose={close}
          onSaved={(name) => {
            close()
            setNotice({ text: `Saved to My programs as ${name}.` })
          }}
        />
      )}

      {notice}
    </>
  )
}

function DayCard(props: {
  day: ProgramDay
  index: number
  count: number
  tms: Tms
  onEdit: (fn: (p: Program) => Program) => void
  onSheet: (sheet: SheetState) => void
}) {
  const { day, index, count, onEdit } = props
  const [renaming, setRenaming] = useState<string>()
  const pinned = day.accessories.flatMap((a) => (a.kind === 'pinned' ? [a] : []))
  const open = day.accessories.filter((a) => a.kind === 'flex').length

  return (
    <section className="card day-edit">
      <div className="title-row">
        {renaming !== undefined ? (
          <>
            <input
              className="input grow"
              value={renaming}
              autoFocus
              aria-label="Day name"
              placeholder={`Day ${index + 1}`}
              onChange={(e) => setRenaming(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                onEdit((p) => renameDay(p, day.id, renaming))
                setRenaming(undefined)
              }}
            >
              Save
            </button>
          </>
        ) : (
          <>
            <h2 className="grow no-margin">{day.name}</h2>
            <MoveButtons
              label={day.name}
              first={index === 0}
              last={index === count - 1}
              onMove={(delta) => onEdit((p) => moveDay(p, day.id, delta))}
            />
          </>
        )}
      </div>

      <span className="label section-label">Main lifts</span>
      {day.mains.length === 0 && <p className="muted small no-margin">None yet.</p>}
      <ul className="list">
        {day.mains.map((slot, j) => (
          <li key={slot.id} className="edit-row">
            <button type="button" className="edit-main grow" onClick={() => props.onSheet({ kind: 'slot', slotId: slot.id })}>
              <strong>{nameOf(slot.exerciseId)}</strong>
              <SlotMeta slot={slot} tms={props.tms} />
            </button>
            <MoveButtons
              label={nameOf(slot.exerciseId)}
              first={j === 0}
              last={j === day.mains.length - 1}
              onMove={(delta) => onEdit((p) => moveMainSlot(p, slot.id, delta))}
            />
          </li>
        ))}
      </ul>
      {day.mains.length < MAX_MAINS && (
        <button
          type="button"
          className="btn btn-quiet btn-small add-line"
          onClick={() => props.onSheet({ kind: 'add', dayId: day.id })}
        >
          + Add a main lift
        </button>
      )}

      <span className="label section-label">Accessories</span>
      <div className="field">
        <Segmented
          label={`${day.name} accessory focus`}
          value={day.focus ?? 'auto'}
          onChange={(value) => onEdit((p) => setDayFocus(p, day.id, value === 'auto' ? undefined : value))}
          options={[
            { value: 'auto', label: `Auto (${DAY_FOCUS_LABELS[dayFocus({ ...day, focus: undefined }, findExercise)]})` },
            { value: 'upper', label: 'Upper' },
            { value: 'lower', label: 'Lower' },
            { value: 'posterior', label: 'Post.' },
            { value: 'full', label: 'Full' },
          ]}
        />
        <p className="muted small no-margin">{FOCUS_HELP[dayFocus(day, findExercise)]}</p>
      </div>
      {pinned.length > 0 && (
        <ul className="list">
          {pinned.map((a) => (
            <li key={a.id} className="row">
              <span className="grow stack">
                <span>{nameOf(a.exerciseId)}</span>
                <span className="muted small">Pinned: in every {day.name} workout</span>
              </span>
              <ConfirmButton
                small
                label="Unpin"
                confirmLabel="Unpin?"
                onConfirm={() => onEdit((p) => removeAccessorySlot(p, a.id))}
              />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-quiet btn-small add-line"
        onClick={() => props.onSheet({ kind: 'pin', dayId: day.id })}
      >
        + Pin an accessory
      </button>
      <div className="counts counts-spaced">
        <Stepper
          label="Open slots, picked at the workout"
          value={open}
          min={0}
          max={MAX_FLEX}
          onChange={(n) => onEdit((p) => setFlexSlots(p, day.id, n, newId))}
        />
      </div>

      {day.groups && day.groups.length > 0 && (
        <>
          <span className="label section-label">Accessory groups</span>
          <ul className="list">
            {day.groups.map((g) => (
              <li key={g.id} className="row">
                <span className="grow stack">
                  <span>{g.name}</span>
                  <span className="muted small">{g.items.map((i) => nameOf(i.exerciseId)).join(' · ')}</span>
                </span>
                <ConfirmButton
                  small
                  label="Remove"
                  confirmLabel="Remove?"
                  onConfirm={() => onEdit((p) => removeGroup(p, g.id))}
                />
              </li>
            ))}
          </ul>
          <p className="muted small no-margin">Saved from a workout's accessories, and offered on this day.</p>
        </>
      )}

      <div className="actions day-actions">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setRenaming(day.name)}>
          Rename
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-small"
          disabled={count >= MAX_DAYS}
          onClick={() => onEdit((p) => addDay(p, newId, day.id))}
        >
          Duplicate
        </button>
        {count > 1 && (
          <ConfirmButton
            small
            label="Remove day"
            confirmLabel="Tap again to remove"
            onConfirm={() => onEdit((p) => removeDay(p, day.id))}
          />
        )}
      </div>
    </section>
  )
}

function FollowedProgram(
  props: ViewProps & { leader?: ProfileRow; leaderProgram: Program; overrides?: ProgramOverrides },
) {
  const { profile, program, tms, leaderProgram } = props
  const leaderName = props.leader?.name ?? 'the leader'
  const [sheet, setSheet] = useState<SheetState>()
  const [notice, setNotice] = useNotice()
  const close = () => setSheet(undefined)
  const leaderSlot = (slotId: string) => leaderProgram.days.flatMap((d) => d.mains).find((m) => m.id === slotId)

  return (
    <>
      <BackLink to={`/profiles/${profile.id}`} label={profile.name} />
      <h1>Program</h1>

      <section className="card">
        <p className="no-margin">
          Follows {props.leader ? <Link to={`/profiles/${props.leader.id}/program`}>{leaderName}'s program</Link> : `${leaderName}'s program`}:{' '}
          <strong>{leaderProgram.name}</strong>
        </p>
        <p className="muted small">
          {leaderName}'s changes reach {profile.name} straight away. Change a lift just for {profile.name} below, or
          unfollow to make the program their own.
        </p>
      </section>

      {program.days.map((day) => (
        <section key={day.id} className="card day-edit">
          <h2>{day.name}</h2>
          {day.mains.length === 0 && <p className="muted small no-margin">No main lifts.</p>}
          <ul className="list">
            {day.mains.map((slot) => (
              <li key={slot.id} className="edit-row">
                <button type="button" className="edit-main grow" onClick={() => setSheet({ kind: 'slot', slotId: slot.id })}>
                  <strong>
                    {nameOf(slot.exerciseId)}
                    {props.overrides?.slots[slot.id] && <span className="badge badge-star">Just for {profile.name}</span>}
                  </strong>
                  <SlotMeta slot={slot} tms={tms} />
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small no-margin accessories-line">
            Accessories: {accessoryText(day, findExercise)} · {DAY_FOCUS_LABELS[dayFocus(day, findExercise)]} focus
          </p>
          {day.groups && day.groups.length > 0 && (
            <p className="muted small no-margin">Groups: {day.groups.map((g) => g.name).join(' · ')}</p>
          )}
        </section>
      ))}

      <section className="card">
        <h2>Whole program</h2>
        <div className="actions no-top">
          <button type="button" className="btn btn-quiet grow" onClick={() => setSheet({ kind: 'switch' })}>
            Switch program…
          </button>
          <button type="button" className="btn btn-quiet grow" onClick={() => setSheet({ kind: 'save' })}>
            Save to My programs
          </button>
        </div>
        <div className="sheet-foot">
          <ConfirmButton
            label="Unfollow"
            confirmLabel="Tap again to unfollow"
            onConfirm={() => void unfollow(profile.id).catch((e: unknown) => setNotice({ text: (e as Error).message, error: true }))}
          />
          <p className="muted small">
            Keeps a copy of the program as it is now, {profile.name}'s changes included, to change freely. {leaderName}'s
            later changes won't reach it.
          </p>
        </div>
      </section>

      {sheet?.kind === 'slot' &&
        (() => {
          const slot = program.days.flatMap((d) => d.mains).find((m) => m.id === sheet.slotId)
          const theirs = leaderSlot(sheet.slotId)
          if (!slot || !theirs) return null
          const changed = Boolean(props.overrides?.slots[slot.id])
          return (
            <SlotSheet
              title={nameOf(slot.exerciseId)}
              note={`Just for ${profile.name}: ${leaderName}'s program stays as it is.`}
              initial={slot}
              tms={tms}
              hidden={props.hidden}
              saveLabel={`Save for ${profile.name}`}
              onClose={close}
              onSave={(fields) => overrideSlot(profile.id, slot.id, overrideDiff(theirs, fields)).then(close)}
              reset={
                changed
                  ? {
                      label: `Use ${leaderName}'s again`,
                      onReset: () => overrideSlot(profile.id, slot.id, undefined).then(close),
                    }
                  : undefined
              }
            />
          )
        })()}

      {sheet?.kind === 'switch' && (
        <SwitchProgramSheet
          profileId={profile.id}
          profileName={profile.name}
          leaderId={props.leader?.id}
          hasFollowers={false}
          onClose={close}
        />
      )}

      {sheet?.kind === 'save' && (
        <SaveTemplateSheet
          program={program}
          onClose={close}
          onSaved={(name) => {
            close()
            setNotice({ text: `Saved to My programs as ${name}.` })
          }}
        />
      )}

      {notice}
    </>
  )
}

/** A snapshot of the program to start other profiles on, or come back to. */
function SaveTemplateSheet(props: { program: Program; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(props.program.name)
  const [error, setError] = useState<string>()
  return (
    <Sheet title="Save to My programs" onClose={props.onClose}>
      <p className="muted small">
        Saves a copy of the program as it is now. New profiles can start from it, and anyone can switch to it later.
        Changes after this don't touch the saved copy.
      </p>
      <div className="field">
        <label className="label" htmlFor="template-name">
          Name
        </label>
        <input id="template-name" className="input" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button
          type="button"
          className="btn grow"
          onClick={() => {
            const finalName = name.trim() || props.program.name
            saveTemplate(props.program, finalName).then(
              () => props.onSaved(finalName),
              (e: unknown) => setError((e as Error).message),
            )
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}
