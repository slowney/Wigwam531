import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, newId } from '../../db/db.ts'
import { applyProgram, followProfile, loadTemplates } from '../../db/programs.ts'
import { blankProgram, MAX_DAYS } from '../../engine/programEdit.ts'
import { optionProgram, programOptions, type Leader } from '../programChoices.ts'
import { ChoiceList, Stepper } from './forms.tsx'
import { Sheet } from './Sheet.tsx'

/**
 * Puts a profile on a different program: a preset, one of My programs, a
 * copy of someone's, someone to follow, or empty days to build on.
 */
export function SwitchProgramSheet(props: {
  profileId: string
  profileName: string
  /** Who they follow now, if anyone. */
  leaderId?: string
  /** Followers can't follow anyone themselves. */
  hasFollowers: boolean
  onClose: () => void
}) {
  const data = useLiveQuery(async () => {
    const profiles = (await db.profiles.toArray()).filter((p) => !p.archived && p.id !== props.profileId)
    const leaders: Leader[] = []
    for (const p of profiles.sort((a, b) => a.createdAt - b.createdAt)) {
      const row = await db.programs.get(p.id)
      if (row?.program && !row.followsProfileId) leaders.push({ id: p.id, name: p.name, program: row.program })
    }
    return { leaders, templates: await loadTemplates() }
  }, [props.profileId])
  const [choice, setChoice] = useState<string>()
  const [days, setDays] = useState(4)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  if (!data) return null

  const options = programOptions({
    leaders: data.leaders,
    templates: data.templates,
    follow: !props.hasFollowers,
    copy: true,
  }).filter((o) => o.value !== `follow:${props.leaderId}`)

  async function apply() {
    if (!choice) return
    setError(undefined)
    setSaving(true)
    try {
      if (choice.startsWith('follow:')) {
        await followProfile(props.profileId, choice.slice('follow:'.length))
      } else if (choice === 'blank') {
        const name = `${props.profileName}'s program`
        await applyProgram(props.profileId, blankProgram(name, days, newId), name)
      } else {
        const source = optionProgram(choice, data!.leaders, data!.templates)
        if (!source) throw new Error('That program is no longer there.')
        await applyProgram(props.profileId, source)
      }
      props.onClose()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <Sheet title="Switch program" onClose={props.onClose}>
      <p className="muted small">
        This week carries on: days already done stay done, and the new program's days start as to do. TMs and history
        stay as they are.
      </p>
      <ChoiceList label="Program" value={choice ?? ''} onChange={setChoice} options={options} />
      {choice === 'blank' && (
        <div className="counts counts-spaced">
          <Stepper label="Days" value={days} min={1} max={MAX_DAYS} onChange={setDays} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn grow" disabled={!choice || saving} onClick={() => void apply()}>
          Switch
        </button>
      </div>
    </Sheet>
  )
}
