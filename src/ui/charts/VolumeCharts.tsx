import { useState } from 'react'

const sets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * Sets per muscle against target, one bar each, with the target as a tick.
 * Tapping a muscle picks it out (for its weekly history below).
 */
export function TargetBars(props: {
  rows: ReadonlyArray<{ key: string; label: string; value: number; target: number }>
  selected?: string
  onSelect: (key: string) => void
}) {
  const max = Math.max(1, ...props.rows.flatMap((r) => [r.value, r.target]))
  return (
    <div className="target-bars" role="list">
      {props.rows.map((r) => (
        <button
          key={r.key}
          type="button"
          role="listitem"
          aria-pressed={props.selected === r.key}
          className={props.selected === r.key ? 'target-bar target-bar-on' : 'target-bar'}
          onClick={() => props.onSelect(r.key)}
        >
          <span className="target-label">{r.label}</span>
          <span className="target-track">
            <span className="target-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            <span className="target-tick" style={{ left: `${(r.target / max) * 100}%` }} />
          </span>
          <span className="target-value">
            {sets(r.value)}/{sets(r.target)}
          </span>
        </button>
      ))}
    </div>
  )
}

const W = 320
const H = 140
const PAD = { left: 8, right: 8, top: 12, bottom: 20 }

/** One muscle's sets week by week, with its target as a line. Tap a week to read it. */
export function WeekColumns(props: {
  label: string
  weeks: ReadonlyArray<{ number: number; value: number }>
  target: number
}) {
  const [picked, setPicked] = useState<number>()
  const last = props.weeks.at(-1)?.number
  const chosen = props.weeks.find((w) => w.number === (picked ?? last))
  const max = Math.max(1, props.target, ...props.weeks.map((w) => w.value)) * 1.1
  const band = (W - PAD.left - PAD.right) / Math.max(1, props.weeks.length)
  const bar = Math.min(24, band - 6)
  const sy = (v: number) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom)
  const base = H - PAD.bottom

  return (
    <figure className="chart">
      <figcaption className="chart-readout">
        {chosen ? (
          <>
            Week {chosen.number}: <strong>{sets(chosen.value)}</strong> of {sets(props.target)} sets
          </>
        ) : (
          'No weeks yet.'
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label} className="chart-svg">
        <line x1={PAD.left} x2={W - PAD.right} y1={sy(props.target)} y2={sy(props.target)} className="chart-target" />
        <text x={W - PAD.right} y={sy(props.target) - 4} className="chart-axis" textAnchor="end">
          target {sets(props.target)}
        </text>
        {props.weeks.map((w, i) => {
          const cx = PAD.left + band * i + band / 2
          const top = sy(w.value)
          const h = base - top
          // Rounded at the data end, square at the baseline.
          const r = Math.min(4, h / 2, bar / 2)
          const d =
            h <= 0
              ? ''
              : `M${cx - bar / 2},${base}V${top + r}Q${cx - bar / 2},${top} ${cx - bar / 2 + r},${top}H${cx + bar / 2 - r}Q${cx + bar / 2},${top} ${cx + bar / 2},${top + r}V${base}Z`
          return (
            <g key={w.number} onClick={() => setPicked(w.number)} className="chart-hit">
              <rect x={cx - band / 2} y={PAD.top} width={band} height={base - PAD.top} fill="transparent" />
              <path d={d} className={w.number === chosen?.number ? 'chart-col chart-col-on' : 'chart-col'} />
              <text x={cx} y={H - 6} className="chart-axis" textAnchor="middle">
                W{w.number}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
