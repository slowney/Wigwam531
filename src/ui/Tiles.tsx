import type { ReactNode } from 'react'

/** A row of stat tiles: a big number, what it is, and how it moved. */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className="tiles">{children}</div>
}

export function Tile(props: { value: ReactNode; label: string; change?: string; up?: boolean }) {
  return (
    <div className="tile">
      <span className="tile-value">{props.value}</span>
      <span className="tile-label">{props.label}</span>
      {props.change && <span className={props.up ? 'tile-change tile-up' : 'tile-change tile-down'}>{props.change}</span>}
    </div>
  )
}
