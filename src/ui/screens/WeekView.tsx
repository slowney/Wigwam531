import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router'
import { findExercise } from '../../data/exercises.ts'
import { HOME_GYM } from '../../data/gym.ts'
import { findScheme } from '../../data/schemes.ts'
import { db } from '../../db/db.ts'
import { loadTms } from '../../db/profiles.ts'
import { endWeek, ensureFirstWeek, loadWeekOverview, setDayStatus, weekState } from '../../db/weeks.ts'
import { waveIndex, type PlannedSlot } from '../../engine/plan.ts'
import { dayLabel } from '../../engine/program.ts'
import { planEntry } from '../../engine/session.ts'
import { statusOf, type DayStatus } from '../../engine/week.ts'
import { BackupReminder } from '../BackupPrompt.tsx'
import { BackLink, ConfirmButton } from '../components/forms.tsx'
import { accessoryText } from '../format.ts'

const STATUS_LABEL: Record<DayStatus, string> = { pending: 'To do', done: 'Done', skipped: 'Skipped' }

function setsText(slot: PlannedSlot): string {
  if (slot.missingTm) return 'No TM entered yet'
  const texts = slot.sets.map((s) => {
    const reps = s.repsMax !== undefined ? `${s.reps}-${s.repsMax}` : `${s.reps}${s.amrap ? '+' : ''}`
    const text = `${s.weight ?? '?'}×${reps}`
    return s.progression ? `[${text}]` : text
  })
  // Runs of the same set (BBB's 5 × 10, BBS's 10 × 5) read better counted.
  const runs: Array<{ text: string; count: number }> = []
  for (const text of texts) {
    const last = runs.at(-1)
    if (last?.text === text) last.count++
    else runs.push({ text, count: 1 })
  }
  return runs.map((r) => (r.count > 1 ? `${r.text} (×${r.count})` : r.text)).join(' · ')
}

export function WeekView() {
  const { id = '' } = useParams()
  const data = useLiveQuery(async () => {
    const profile = await db.profiles.get(id)
    if (!profile) return { profile }
    const overview = await loadWeekOverview(id)
    // Which workout did each day this week, so a done day can open it.
    const doneIn: Record<string, string> = {}
    if (overview.week) {
      for (const entry of await db.entries.where('weekId').equals(overview.week.id).toArray()) {
        if (entry.status === 'done') doneIn[entry.dayId] = entry.sessionId
      }
    }
    return {
      profile,
      overview,
      doneIn,
      tms: await loadTms(id),
      weeks: await db.weeks.where('profileId').equals(id).toArray(),
      history: await db.sets.where('profileId').equals(id).toArray(),
      gym: (await db.gyms.get('home')) ?? HOME_GYM,
    }
  }, [id])
  if (!data) return null
  const { profile, overview } = data
  if (!profile || !overview?.program || !data.gym) {
    return (
      <>
        <BackLink to="/profiles" label="Profiles" />
        <p className="muted">Nothing to show.</p>
      </>
    )
  }

  const { week, program, complete } = overview
  const number = week?.number ?? 1
  const label = week?.type === 'deload' ? ' · Deload' : week?.type === 'tmTest' ? ' · TM test' : ''

  async function setStatus(dayId: string, status: DayStatus) {
    const w = week ?? (await ensureFirstWeek(profile!.id))
    await setDayStatus(w.id, dayId, status)
  }

  return (
    <>
      <BackLink to={`/profiles/${profile.id}`} label={profile.name} />
      <h1>
        Week {number}
        <span className="muted">{label}</span>
      </h1>
      <p className="muted">{profile.name}</p>
      <BackupReminder only="weekDone" />

      {program.days.map((day) => {
        const status = week ? statusOf(weekState(week), day.id) : 'pending'
        const plan = planEntry({
          program,
          dayId: day.id,
          swaps: {},
          accessories: [],
          weekType: week?.type ?? 'normal',
          waveIndex: week ? waveIndex(data.weeks ?? [], week.number) : 0,
          tms: data.tms ?? {},
          history: data.history ?? [],
          sessionId: '',
          gym: data.gym!,
          lookup: findExercise,
          schemes: findScheme,
        })
        return (
          <section key={day.id} className={`card day day-${status}`}>
            <div className="title-row">
              <h2 className="grow no-margin">{dayLabel(day, findExercise)}</h2>
              <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
            </div>
            {plan?.day.mains.map((slot) => (
              <div key={slot.slotId} className="day-slot">
                <strong>{findExercise(slot.exerciseId)?.name ?? slot.exerciseId}</strong>{' '}
                <span className="muted small">
                  {slot.tier}
                  {slot.wave ? ` · ${slot.wave}` : ''}
                </span>
                <div className="small mono">{setsText(slot)}</div>
              </div>
            ))}
            <p className="muted small day-slot">Accessories: {accessoryText(day, findExercise)}</p>
            {!complete && status === 'pending' && (
              <button type="button" className="btn btn-quiet btn-small" onClick={() => void setStatus(day.id, 'skipped')}>
                Skip this day
              </button>
            )}
            {!complete && status === 'skipped' && (
              <button type="button" className="btn btn-quiet btn-small" onClick={() => void setStatus(day.id, 'pending')}>
                Unskip
              </button>
            )}
            {status === 'done' && data.doneIn?.[day.id] && (
              <Link to={`/sessions/${data.doneIn[day.id]}`} className="btn btn-quiet btn-small">
                View workout
              </Link>
            )}
          </section>
        )
      })}

      {complete ? (
        <Link to={`/start-week?ids=${profile.id}`} className="btn btn-big">
          Start Week {number + 1}
        </Link>
      ) : (
        week && (
          <section className="card">
            <ConfirmButton
              label="End this week"
              confirmLabel="Tap again to end it"
              onConfirm={() => void endWeek(week.id)}
            />
            <p className="muted small">Skips any days left, so you can review TMs and start the next week.</p>
          </section>
        )
      )}
    </>
  )
}
