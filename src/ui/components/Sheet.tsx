import type { ReactNode } from 'react'

/** A panel that slides up over the screen. Tapping outside closes it. */
export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="grow no-margin">{props.title}</h2>
          <button type="button" className="btn btn-quiet btn-small" onClick={props.onClose}>
            Close
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}
