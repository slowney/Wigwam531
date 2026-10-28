import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { findScheme } from '../../data/schemes.ts'
import { db, type BodyweightRow, type RestrictionRow } from '../../db/db.ts'
import { loadRestrictions, removeRestriction } from '../../db/restrictions.ts'
import { MUSCLE_LABELS, type Focus } from '../../engine/types.ts'
import { FocusSheet } from '../components/FocusSheet.tsx'
import { ProgressionSheet } from '../components/ProgressionSheet.tsx'
import { RestrictionSheet } from '../components/RestrictionSheet.tsx'
import {
  addBodyweight,
  archiveProfile,
  deleteBodyweight,
  loadBodyweights,
  loadProgram,
  loadTms,
  removeFocus,
  restoreProfile,
  setTm,
} from '../../db/profiles.ts'
import { progressedTms, requiredTms } from '../../engine/program.ts'
import { tmFromOneRepMax } from '../../engine/weights.ts'
import { BackLink, ConfirmButton, parseLb, Segmented } from '../components/forms.tsx'
import { formatDate } from '../format.ts'

export function ProfileDetail() {
  const { id = '' } = useParams()
  const data = useLiveQuery(async () => {
    const profile = await db.profiles.get(id)
    if (!profile) return { profile }
    const row = await db.programs.get(id)
    return {
      profile,
      program: await loadProgram(id),
      leader: row?.followsProfileId ? await db.profiles.get(row.followsProfileId) : undefined,
      followers: await db.programs.where('followsProfileId').equals(id).count(),
      tms: await loadTms(id),
      bodyweights: await loadBodyweights(id),
      restrictions: await loadRestrictions(id),
    }
  }, [id])
  const [editingIncreases, setEditingIncreases] = useState(false)
  if (!data) return null

  const { profile } = data
  if (!profile) {
    return (
      <>
        <BackLink to="/profiles" label="Profiles" />
        <p className="muted">That profile doesn't exist.</p>
      </>
    )
  }

  const tms = data.tms ?? {}
  const lifts = data.program ? requiredTms(data.program, findScheme) : []
  // TMs for lifts the program no longer uses stay visible; they're still history.
  const extra = Object.keys(tms).filter((id) => !lifts.includes(id))
  const moved = data.program ? progressedTms(data.program, findScheme) : []

  return (
    <>
      <BackLink to="/profiles" label="Profiles" />
      <div className="title-row">
        <span className="dot dot-big" style={{ background: profile.color }} />
        <h1 className="grow">{profile.name}</h1>
        <Link to={`/profiles/${profile.id}/edit`} className="btn btn-quiet btn-small">
          Edit
        </Link>
      </div>
      {profile.archived && <p className="muted">Archived.</p>}

      <section className="card">
        <h2>Program</h2>
        <p className="no-margin">
          {data.leader ? `Follows ${data.leader.name}: ` : ''}
          {data.program?.name ?? 'None'}
        </p>
        <div className="link-row week-link">
          <Link to={`/profiles/${profile.id}/week`} className="btn btn-quiet btn-small">
            This week's plan
          </Link>
          <Link to={`/profiles/${profile.id}/program`} className="btn btn-quiet btn-small">
            Edit program
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>Training maxes</h2>
        {[...lifts, ...extra].map((exerciseId) => (
          <TmRow key={exerciseId} profileId={profile.id} exerciseId={exerciseId} value={tms[exerciseId]} />
        ))}
        {moved.length > 0 && (
          <button type="button" className="btn btn-quiet btn-small week-link" onClick={() => setEditingIncreases(true)}>
            TM increases
          </button>
        )}
        {editingIncreases && (
          <ProgressionSheet
            profileId={profile.id}
            lifts={moved}
            tables={profile.progressionTables ?? {}}
            onClose={() => setEditingIncreases(false)}
          />
        )}
      </section>

      <AccessoriesCard profileId={profile.id} restrictions={data.restrictions ?? []} focuses={profile.focuses ?? []} />

      <BodyweightCard profileId={profile.id} entries={data.bodyweights ?? []} />

      <section className="card">
        {profile.archived ? (
          <button type="button" className="btn btn-quiet" onClick={() => void restoreProfile(profile.id)}>
            Restore profile
          </button>
        ) : (
          <>
            <ConfirmButton
              label="Archive profile"
              confirmLabel="Tap again to archive"
              onConfirm={() => void archiveProfile(profile.id)}
            />
            <p className="muted small">
              Archiving hides {profile.name} without deleting anything.
              {data.followers ? ' Anyone following them keeps a copy of the program as it is now.' : ''}
            </p>
          </>
        )}
      </section>
    </>
  )
}

function TmRow(props: { profileId: string; exerciseId: string; value: number | undefined }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'tm' | 'oneRepMax'>('tm')
  const name = findExercise(props.exerciseId)?.name ?? props.exerciseId
  const entered = parseLb(text)
  const tm = entered !== undefined && mode === 'oneRepMax' ? tmFromOneRepMax(entered) : entered

  async function save() {
    if (tm === undefined) return
    await setTm(props.profileId, props.exerciseId, tm)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="row">
        <span className="grow">{name}</span>
        <strong>{props.value ?? '—'}</strong>
        <button
          type="button"
          className="btn btn-quiet btn-small"
          onClick={() => {
            setText(props.value ? String(props.value) : '')
            // A TM to adjust starts as a TM; a lift with none yet starts from a 1RM, like setup.
            setMode(props.value ? 'tm' : 'oneRepMax')
            setEditing(true)
          }}
        >
          {props.value ? 'Edit' : 'Set'}
        </button>
      </div>
    )
  }
  return (
    <div className="tm-edit">
      <div className="row">
        <span className="grow">{name}</span>
        <input
          className="input input-number"
          inputMode="decimal"
          autoFocus
          value={text}
          aria-label={mode === 'tm' ? `${name} TM` : `${name} 1RM`}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
        />
      </div>
      <Segmented
        label={`${name}: enter as`}
        value={mode}
        onChange={(m) => {
          setMode(m)
          // The number typed meant the other thing; don't carry it over.
          setText('')
        }}
        options={[
          { value: 'tm', label: 'TM' },
          { value: 'oneRepMax', label: '1RM' },
        ]}
      />
      {mode === 'oneRepMax' && (
        <p className="muted small no-margin">{tm !== undefined ? `TM ${tm}: 90% of ${entered}.` : 'The TM is set at 90% of it.'}</p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-small grow" disabled={tm === undefined} onClick={() => void save()}>
          Save{tm !== undefined && mode === 'oneRepMax' ? ` TM ${tm}` : ''}
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function untilText(until: number | undefined, now: number): string {
  if (until === undefined) return 'Until removed'
  return until <= now ? `Ended ${formatDate(until)}` : `Until ${formatDate(until)}`
}

function AccessoriesCard(props: { profileId: string; restrictions: RestrictionRow[]; focuses: Focus[] }) {
  const { profileId, restrictions, focuses } = props
  const [adding, setAdding] = useState(false)
  const [addingFocus, setAddingFocus] = useState(false)
  const now = Date.now()
  return (
    <section className="card">
      <h2>Accessory suggestions</h2>
      <div className="link-row">
        <Link to={`/profiles/${profileId}/exercises`} className="btn btn-quiet btn-small">
          Exercise ratings
        </Link>
        <Link to={`/profiles/${profileId}/targets`} className="btn btn-quiet btn-small">
          Muscle targets
        </Link>
      </div>

      <span className="label">Focus</span>
      {focuses.length === 0 && <p className="muted small no-margin">None: suggestions follow the weekly targets.</p>}
      <ul className="list">
        {focuses.map((f) => {
          const ended = f.until !== undefined && f.until <= now
          return (
            <li key={f.id} className={ended ? 'row muted' : 'row'}>
              <span className="grow stack">
                <span>{f.name}</span>
                <span className="muted small">
                  +{f.extraSets} sets a week each · {f.muscles.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(', ')} ·{' '}
                  {untilText(f.until, now)}
                </span>
              </span>
              <ConfirmButton small label="Remove" confirmLabel="Remove?" onConfirm={() => void removeFocus(profileId, f.id)} />
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn btn-quiet btn-small add-restriction" onClick={() => setAddingFocus(true)}>
        + Add a focus
      </button>
      {addingFocus && <FocusSheet profileId={profileId} onClose={() => setAddingFocus(false)} />}

      <span className="label section-label">Restrictions</span>
      {restrictions.length === 0 && <p className="muted small no-margin">None.</p>}
      <ul className="list">
        {restrictions.map((r) => {
          const ended = r.until !== undefined && r.until <= now
          return (
            <li key={r.id} className={ended ? 'row muted' : 'row'}>
              <span className="grow stack">
                <span>{r.name}</span>
                <span className="muted small">{untilText(r.until, now)}</span>
              </span>
              <ConfirmButton small label="Remove" confirmLabel="Remove?" onConfirm={() => void removeRestriction(r.id)} />
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn btn-quiet btn-small add-restriction" onClick={() => setAdding(true)}>
        + Add a restriction
      </button>
      {adding && <RestrictionSheet profileId={profileId} onClose={() => setAdding(false)} />}
    </section>
  )
}

function BodyweightCard({ profileId, entries }: { profileId: string; entries: BodyweightRow[] }) {
  const [text, setText] = useState('')
  const lb = parseLb(text)

  return (
    <section className="card">
      <h2>Bodyweight</h2>
      <div className="row">
        <input
          className="input grow"
          inputMode="decimal"
          placeholder="Today's weight, lb"
          aria-label="Bodyweight in pounds"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
        />
        <button
          type="button"
          className="btn"
          disabled={lb === undefined}
          onClick={() => {
            if (lb === undefined) return
            void addBodyweight(profileId, lb).then(() => setText(''))
          }}
        >
          Log
        </button>
      </div>
      {entries.length > 0 && (
        <ul className="list">
          {entries.slice(0, 10).map((b) => (
            <li key={b.id} className="row">
              <span className="grow muted">{formatDate(b.at)}</span>
              <strong>{b.lb} lb</strong>
              <ConfirmButton small label="Delete" confirmLabel="Delete?" onConfirm={() => void deleteBodyweight(b.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
