import { useState, type PointerEvent, type ReactNode } from 'react'

// A small time-series chart drawn as SVG: lines or steps, dots, and a ring
// on marked points. Tapping or dragging picks the nearest moment, and the
// readout above the chart describes it, so it works without hover.

export interface ChartPoint {
  x: number
  y: number
  key: string
}

export interface ChartSeries {
  name: string
  /** A CSS colour, normally one of the --chart tokens. */
  color: string
  points: ChartPoint[]
  /** Holds its value until the next point (a TM), instead of joining points. */
  step?: boolean
  dots?: boolean
}

const W = 320
const H = 170
const PAD = { left: 36, right: 10, top: 10, bottom: 22 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Round tick steps, so the axis reads 200 / 225 / 250 rather than 203 / 228. */
function ticks(min: number, max: number): number[] {
  const span = max - min || 1
  const step = [1, 2, 5, 10, 25, 50, 100, 250].find((s) => span / s <= 4) ?? 500
  const out = []
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) out.push(t)
  return out
}

/** The first of each month in the range, thinned so the labels never crowd. */
function monthTicks(from: number, to: number): number[] {
  const out: number[] = []
  const d = new Date(from)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() + 1)
  while (d.getTime() <= to) {
    out.push(d.getTime())
    d.setMonth(d.getMonth() + 1)
  }
  const every = Math.ceil(out.length / 5)
  return out.filter((_, i) => i % every === 0)
}

export function LineChart(props: {
  label: string
  series: ChartSeries[]
  /** The range shown. A step series starts from its value as of `from`. */
  from: number
  to: number
  /** Points (by key, on any series) to ring: PRs. */
  marked?: ReadonlySet<string>
  /** Describes the chosen moment, shown above the chart. */
  readout: (x: number) => ReactNode
  formatY?: (y: number) => string
}) {
  const formatY = props.formatY ?? ((y: number) => String(Math.round(y)))

  // What's on screen: points in range, plus each step series' value going in.
  const shown = props.series.map((s) => {
    const inside = s.points.filter((p) => p.x >= props.from && p.x <= props.to)
    const before = s.step ? s.points.filter((p) => p.x < props.from).at(-1) : undefined
    return { ...s, points: before ? [{ ...before, x: props.from }, ...inside] : inside }
  })
  const all = shown.flatMap((s) => s.points)
  const latest = all.reduce<number | undefined>((m, p) => (m === undefined || p.x > m ? p.x : m), undefined)
  const [picked, setPicked] = useState<number>()
  if (all.length === 0) return <p className="muted small no-margin">Nothing logged in this range.</p>

  const x0 = Number.isFinite(props.from) ? props.from : Math.min(...all.map((p) => p.x))
  const x1 = Math.max(props.to, x0 + 1)
  const ys = all.map((p) => p.y)
  const pad = Math.max(1, (Math.max(...ys) - Math.min(...ys)) * 0.08)
  const y0 = Math.min(...ys) - pad
  const y1 = Math.max(...ys) + pad
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * (W - PAD.left - PAD.right)
  const sy = (y: number) => H - PAD.bottom - ((y - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom)

  const path = (s: (typeof shown)[number]) => {
    if (s.points.length === 0) return ''
    let d = `M${sx(s.points[0]!.x)},${sy(s.points[0]!.y)}`
    for (const [i, p] of s.points.entries()) {
      if (i === 0) continue
      d += s.step ? `H${sx(p.x)}V${sy(p.y)}` : `L${sx(p.x)},${sy(p.y)}`
    }
    // A TM stays where it is up to today.
    if (s.step) d += `H${sx(x1)}`
    return d
  }

  // Choosing the moment nearest the tap, among the points with dots.
  const targets = shown.filter((s) => s.dots).flatMap((s) => s.points)
  const choices = targets.length ? targets : all
  const selected = picked ?? choices.reduce((m, p) => (p.x > m ? p.x : m), -Infinity)
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    const nearest = choices.reduce((best, p) => (Math.abs(sx(p.x) - vx) < Math.abs(sx(best.x) - vx) ? p : best))
    setPicked(nearest.x)
  }

  const legend = props.series.length > 1 || (props.marked && props.marked.size > 0)

  return (
    <figure className="chart">
      <figcaption className="chart-readout">{props.readout(selected ?? latest ?? x1)}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={props.label}
        className="chart-svg"
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons && pick(e)}
      >
        {ticks(y0, y1).map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} className="chart-grid" />
            <text x={PAD.left - 6} y={sy(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {formatY(t)}
            </text>
          </g>
        ))}
        {monthTicks(x0, x1).map((t) => (
          <text key={t} x={sx(t)} y={H - 6} className="chart-axis" textAnchor="middle">
            {MONTHS[new Date(t).getMonth()]}
          </text>
        ))}
        {Number.isFinite(selected) && (
          <line x1={sx(selected)} x2={sx(selected)} y1={PAD.top} y2={H - PAD.bottom} className="chart-cross" />
        )}
        {shown.map((s) => (
          <path key={s.name} d={path(s)} fill="none" stroke={s.color} className="chart-line" />
        ))}
        {shown
          .filter((s) => s.dots)
          .map((s) =>
            s.points.map((p) => (
              <g key={`${s.name}-${p.key}`}>
                {props.marked?.has(p.key) && <circle cx={sx(p.x)} cy={sy(p.y)} r={7} className="chart-ring" />}
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={p.x === selected ? 5 : 3.5}
                  fill={s.color}
                  className="chart-dot"
                />
              </g>
            )),
          )}
      </svg>
      {legend && (
        <div className="chart-legend">
          {props.series.map((s) => (
            <span key={s.name} className="chart-key">
              <svg width="18" height="10" aria-hidden="true">
                <path d={s.step ? 'M1,8H9V2H17' : 'M1,5H17'} stroke={s.color} strokeWidth="2" fill="none" />
              </svg>
              {s.name}
            </span>
          ))}
          {props.marked && props.marked.size > 0 && (
            <span className="chart-key">
              <svg width="14" height="14" aria-hidden="true">
                <circle cx="7" cy="7" r="5.5" className="chart-ring" />
              </svg>
              PR
            </span>
          )}
        </div>
      )}
    </figure>
  )
}
