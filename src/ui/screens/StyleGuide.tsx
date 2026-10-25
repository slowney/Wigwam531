// Dev build only: every token and component on one page, to review the
// look in the phone-size preview before it reaches a real screen.
import { Icon, type IconName } from '../icons.tsx'
import { Mark } from '../Mark.tsx'
import { Tile, Tiles } from '../Tiles.tsx'
import { ConfirmButton, Segmented, Stepper } from '../components/forms.tsx'

const COLORS = ['--bg', '--surface', '--surface-2', '--surface-3', '--border', '--text', '--text-2', '--muted', '--accent', '--warning', '--ok', '--danger']
const SIZES = ['--fs-caption', '--fs-subhead', '--fs-body', '--fs-title', '--fs-large', '--fs-display']
const ICONS: IconName[] = ['home', 'chart', 'people', 'settings', 'check', 'plus', 'swap', 'skip', 'note', 'timer', 'star', 'warning', 'chevron', 'up', 'down', 'trash', 'barbell']

export function StyleGuide() {
  return (
    <>
      <h1 className="wordmark">
        <Mark />
        <span>
          Wigwam<span className="wordmark-num">531</span>
        </span>
      </h1>
      <section className="card">
        <h2>Colour roles</h2>
        <div className="swatch-row">
          {COLORS.map((c) => (
            <div key={c} className="stack">
              <span className="swatch-tile" style={{ background: `var(${c})` }} />
              <span className="small muted">{c}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Type</h2>
        {SIZES.map((v) => (
          <p key={v} className="no-margin" style={{ fontSize: `var(${v})` }}>
            {v.replace('--fs-', '')} <span className="num">225 × 5</span>
          </p>
        ))}
      </section>
      <section className="card">
        <h2>Icons</h2>
        <div className="icon-row">
          {ICONS.map((i) => (
            <Icon key={i} name={i} label={i} />
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Buttons</h2>
        <div className="actions no-top">
          <button type="button" className="btn">
            Primary
          </button>
          <button type="button" className="btn btn-quiet">
            Quiet
          </button>
          <button type="button" className="btn btn-small">
            Small
          </button>
          <ConfirmButton label="Delete" confirmLabel="Tap again" onConfirm={() => {}} />
        </div>
        <button type="button" className="btn btn-big">
          <Icon name="barbell" size="1.5rem" />
          Start workout
        </button>
      </section>
      <section className="card">
        <h2>Controls</h2>
        <Segmented
          label="Range"
          value="6M"
          onChange={() => {}}
          options={['3M', '6M', '1Y', 'All'].map((v) => ({ value: v, label: v }))}
        />
        <div className="chips">
          <button type="button" className="chip chip-on">
            Lats 4/14
          </button>
          <button type="button" className="chip">
            Biceps 2/12
          </button>
        </div>
        <div className="counts counts-spaced">
          <Stepper label="Sets" value={3} onChange={() => {}} />
        </div>
      </section>
      <section className="card">
        <h2>Tiles</h2>
        <Tiles>
          <Tile value="12,450" label="lb moved" change="+6% on last time" up />
          <Tile value={27} label="sets" />
          <Tile value="9/16" label="muscles on target" change="−2 on last week" />
        </Tiles>
      </section>
      <section className="card slot">
        <h2>Sets</h2>
        <div className="set set-done">
          <span className="set-num set-check">
            <Icon name="check" size="0.9em" />
          </span>
          <span className="grow">
            <strong>205 × 5</strong>
          </span>
        </div>
        <div className="set set-current">
          <span className="set-main">
            <span className="set-num">2</span>
            <span className="grow">235 × 3</span>
          </span>
          <button type="button" className="btn btn-quiet miss-btn">
            Missed
          </button>
          <button type="button" className="btn log-btn">
            ✓
          </button>
        </div>
        <div className="set set-pending">
          <span className="set-num">3</span>
          <span className="grow">260 × 1+</span>
        </div>
      </section>
    </>
  )
}
