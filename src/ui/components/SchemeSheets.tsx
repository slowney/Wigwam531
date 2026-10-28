import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { allSchemes, findScheme } from '../../data/schemes.ts'
import { db } from '../../db/db.ts'
import { deleteScheme, saveScheme, schemeUsers } from '../../db/schemes.ts'
import { rangeSchemeId, type PercentScheme, type PercentSet } from '../../engine/schemes.ts'
import { percentSetText, schemeSummary } from '../format.ts'
import { ConfirmButton, Segmented, Stepper } from './forms.tsx'
import { Sheet } from './Sheet.tsx'

const isPercent = (s: { kind: string }): s is PercentScheme => s.kind === 'percent'

/** Custom schemes are the ones stored in the app; built-ins ship in code and can only be copied. */
export function useCustomSchemeIds(): ReadonlySet<string> {
  const ids = useLiveQuery(async () => new Set(await db.schemes.toCollection().primaryKeys()), [])
  return ids ?? new Set()
}

/** Every way a lift's sets can run: any rep range, or a percent scheme. */
export function SchemePicker(props: { current: string; onPick: (schemeId: string) => void; onClose: () => void }) {
  const current = findScheme(props.current)
  const custom = useCustomSchemeIds()
  const [sets, setSets] = useState(current?.kind === 'range' ? current.sets : 3)
  const [low, setLow] = useState(current?.kind === 'range' ? current.reps[0] : 8)
  const [high, setHigh] = useState(current?.kind === 'range' ? current.reps[1] : 12)
  const [editor, setEditor] = useState<{ editing?: PercentScheme; from?: PercentScheme }>()
  const percents = allSchemes().filter(isPercent)

  if (editor) {
    return <SchemeEditor {...editor} onSaved={props.onPick} onClose={() => setEditor(undefined)} />
  }

  return (
    <Sheet title="Sets and reps" onClose={props.onClose}>
      <h3 className="picker-group">Rep range</h3>
      <p className="muted small no-margin">
        A working weight that goes up once every set reaches the top of the range. Nothing to do with a TM.
      </p>
      <div className="counts counts-spaced">
        <Stepper label="Sets" value={sets} min={1} max={10} onChange={setSets} />
        <Stepper
          label="Reps from"
          value={low}
          min={1}
          max={30}
          onChange={(n) => {
            setLow(n)
            if (n > high) setHigh(n)
          }}
        />
        <Stepper label="to" value={high} min={low} max={30} onChange={setHigh} />
      </div>
      <button type="button" className="btn btn-quiet" onClick={() => props.onPick(rangeSchemeId(sets, [low, high]))}>
        Use {sets} × {low === high ? low : `${low}–${high}`}
      </button>

      <h3 className="picker-group">Percent of a TM</h3>
      {percents.map((s) => (
        <button key={s.id} type="button" className="picker-item" onClick={() => props.onPick(s.id)}>
          <span className="grow stack">
            <span>
              {s.id === props.current ? '✓ ' : ''}
              {s.name}
              {custom.has(s.id) ? <span className="muted small"> · yours</span> : null}
            </span>
            <span className="muted small">{schemeSummary(s)}</span>
          </span>
        </button>
      ))}
      <div className="actions">
        <button type="button" className="btn btn-quiet grow" onClick={() => setEditor(current && isPercent(current) ? { from: current } : {})}>
          + New scheme
        </button>
        {current && isPercent(current) && custom.has(current.id) && (
          <button type="button" className="btn btn-quiet grow" onClick={() => setEditor({ editing: current })}>
            Edit {current.name}
          </button>
        )}
      </div>
      {current && isPercent(current) && (
        <p className="muted small">New schemes start as a copy of {current.name}, to change from there.</p>
      )}
    </Sheet>
  )
}

interface Row {
  pct: string
  /** "5", or a range: "6-8". */
  reps: string
  amrap: boolean
  progression: boolean
}

const toRow = (s: PercentSet): Row => ({
  pct: String(s.pct),
  reps: s.repsMax !== undefined ? `${s.reps}-${s.repsMax}` : String(s.reps),
  amrap: Boolean(s.amrap),
  progression: Boolean(s.progression),
})

const fromRow = (r: Row): PercentSet => {
  const [low, high] = r.reps.split('-')
  return {
    pct: Number(r.pct),
    reps: Number(low),
    ...(high ? { repsMax: Number(high) } : {}),
    ...(r.amrap ? { amrap: true } : {}),
    ...(r.progression ? { progression: true } : {}),
  }
}

const STARTER: PercentSet[] = [
  { pct: 70, reps: 5 },
  { pct: 80, reps: 3 },
  { pct: 90, reps: 1, amrap: true, progression: true },
]

/**
 * A percent scheme, set by set. Changing one changes the plan everywhere
 * it's used from now on; sets already logged keep what they were.
 */
export function SchemeEditor(props: {
  /** One of the app's own schemes to change. Without it, a new one, copied from `from` if given. */
  editing?: PercentScheme
  from?: PercentScheme
  onSaved: (id: string) => void
  onClose: () => void
}) {
  const start = props.editing ?? props.from
  const [name, setName] = useState(props.editing?.name ?? (props.from ? `My ${props.from.name}` : ''))
  // A wave has one list of sets per week; anything else is a wave of one.
  const [weeks, setWeeks] = useState<Row[][]>(() => (start?.waves ?? [start?.sets ?? STARTER]).map((w) => w.map(toRow)))
  const [tab, setTab] = useState(0)
  const rows = weeks[tab]!
  const setRows = (next: Row[]) => setWeeks(weeks.map((w, i) => (i === tab ? next : w)))
  const [error, setError] = useState<string>()
  const users = useLiveQuery(() => (props.editing ? schemeUsers(props.editing.id) : []), [props.editing?.id])

  const change = (i: number, update: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...update } : r)))
  // One ★ set at most, and it's always open-ended: its reps are the result.
  const star = (i: number) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, progression: !r.progression, amrap: true } : { ...r, progression: false })))

  async function save() {
    setError(undefined)
    try {
      const sets = weeks.map((w) => w.map(fromRow))
      const scheme = {
        kind: 'percent' as const,
        name,
        sets: sets[0]!,
        // The ramp isn't editable here; a copy keeps the original's.
        ...(start?.ramp ? { ramp: start.ramp } : {}),
        ...(start?.waves ? { waves: sets, waveNames: start.waveNames, cycle: start.cycle } : {}),
      }
      props.onSaved(await saveScheme(props.editing ? { ...scheme, id: props.editing.id } : scheme))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={props.editing ? 'Edit scheme' : 'New scheme'} onClose={props.onClose}>
      <div className="field">
        <label className="label" htmlFor="scheme-name">
          Name
        </label>
        <input id="scheme-name" className="input" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </div>
      {weeks.length > 1 && (
        <div className="range-picker">
          <Segmented
            label="Wave week"
            value={String(tab)}
            onChange={(v) => setTab(Number(v))}
            options={weeks.map((_, i) => ({ value: String(i), label: start?.waveNames?.[i] ?? `Week ${i + 1}` }))}
          />
        </div>
      )}
      <div className="scheme-rows" role="table" aria-label="Sets">
        <div className="scheme-row scheme-head" role="row">
          <span>Set</span>
          <span>% of TM</span>
          <span>Reps</span>
          <span>1+</span>
          <span>★</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="scheme-row" role="row">
            <span className="muted">{i + 1}</span>
            <input
              className="input input-tiny"
              inputMode="numeric"
              aria-label={`Set ${i + 1} percent`}
              value={r.pct}
              onChange={(e) => change(i, { pct: e.target.value.replace(/[^0-9.]/g, '') })}
            />
            <input
              className="input input-tiny"
              // Not the number pad: a range needs its dash.
              inputMode="text"
              autoComplete="off"
              aria-label={`Set ${i + 1} reps, or a range like 6-8`}
              value={r.reps}
              onChange={(e) =>
                change(i, {
                  reps: e.target.value
                    .replace(/[–—]/g, '-')
                    .replace(/[^0-9-]/g, '')
                    .replace(/^-+/, '')
                    .replace(/-(?=.*-)/g, ''),
                })
              }
            />
            <button
              type="button"
              className={r.amrap ? 'chip chip-on chip-square' : 'chip chip-square'}
              aria-pressed={r.amrap}
              aria-label={`Set ${i + 1}: as many reps as possible`}
              onClick={() => change(i, r.amrap ? { amrap: false, progression: false } : { amrap: true })}
            >
              +
            </button>
            <button
              type="button"
              className={r.progression ? 'chip chip-on chip-square' : 'chip chip-square'}
              aria-pressed={r.progression}
              aria-label={`Set ${i + 1} moves the TM`}
              onClick={() => star(i)}
            >
              ★
            </button>
            <button
              type="button"
              className="btn btn-quiet step"
              aria-label={`Remove set ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-quiet btn-small add-set"
        onClick={() => {
          const last = rows[rows.length - 1]
          setRows([...rows, last ? { ...last, progression: false } : toRow(STARTER[0]!)])
        }}
      >
        + Add a set
      </button>
      <p className="muted small">
        Reps can be a range, like 6-8: the weight stays put and the reps are your call. 1+ leaves the reps open: as
        many as you can get. ★ marks the set whose reps move the TM at Start Week. Only one set can have it.
      </p>
      {start?.ramp?.length ? (
        <p className="muted small">Keeps {start.name}'s warm-up ramp: {start.ramp.map(percentSetText).join(', ')}.</p>
      ) : null}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn grow" onClick={() => void save()}>
          Save
        </button>
      </div>
      {props.editing && (
        <div className="sheet-foot">
          {users && users.length > 0 ? (
            <p className="muted small">Used by {users.join(', ')}. Change those lifts before deleting it.</p>
          ) : (
            <ConfirmButton
              label="Delete scheme"
              confirmLabel="Tap again to delete"
              onConfirm={() => {
                const id = props.editing!.id
                deleteScheme(id).then(props.onClose, (e: unknown) => setError((e as Error).message))
              }}
            />
          )}
        </div>
      )}
    </Sheet>
  )
}

/** A built-in scheme, set by set. They can't change, but can be copied. */
export function SchemeView(props: { scheme: PercentScheme; onCopy: () => void; onClose: () => void }) {
  return (
    <Sheet title={props.scheme.name} onClose={props.onClose}>
      {props.scheme.ramp?.length ? (
        <p className="muted small">
          Warm-up ramp: {props.scheme.ramp.map(percentSetText).join(', ')}. Any that land within 10 lb of the working
          weight are dropped.
        </p>
      ) : null}
      {(props.scheme.waves ?? [props.scheme.sets]).map((sets, w) => (
        <div key={w}>
          {props.scheme.waves && <h3 className="picker-group">{props.scheme.waveNames?.[w] ?? `Week ${w + 1}`} week</h3>}
          <ol className="scheme-list">
            {sets.map((s, i) => (
              <li key={i}>
                {percentSetText(s)}
                {s.progression ? ' ★' : ''}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {props.scheme.cycle && (
        <p className="muted small">The TM moves once a cycle: +5 upper body, +10 lower, if every 1+ set made its reps.</p>
      )}
      <p className="muted small">Built-in schemes stay as they are. Copy one to make your own version.</p>
      <div className="actions">
        <button type="button" className="btn grow" onClick={props.onCopy}>
          Copy to change
        </button>
      </div>
    </Sheet>
  )
}
