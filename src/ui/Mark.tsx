// The app's mark: the wigwam with a loaded barbell across its front. The
// same shapes as the home-screen icon (scripts/make-icons.mjs), in a 1×1 box.

const PLATES = [
  [0.115, 0.175, 0.51, 0.81],
  [0.19, 0.235, 0.555, 0.765],
] as const

export function Mark({ size = '1.1em' }: { size?: string }) {
  type Rect = readonly [number, number, number, number]
  const plates = PLATES.flatMap(([x0, x1, y0, y1]): Rect[] => [
    [x0, x1, y0, y1],
    [1 - x1, 1 - x0, y0, y1],
  ])
  return (
    <svg viewBox="0 0.035 1 1" width={size} height={size} className="mark" aria-hidden="true">
      <path d="M0.19 0.6 A0.31 0.31 0 0 1 0.81 0.6 Z" fill="var(--accent)" />
      <path d="M0.2 0.41 H0.8 M0.17 0.5 H0.83" stroke="var(--bg)" strokeWidth="0.022" />
      <path d="M0.44 0.6 V0.51 A0.06 0.06 0 0 1 0.56 0.51 V0.6 Z" fill="var(--bg)" />
      <rect x="0.175" y="0.645" width="0.65" height="0.03" fill="var(--text)" />
      {plates.map(([x0, x1, y0, y1], i) => (
        <rect
          key={i}
          x={x0}
          y={y0}
          width={x1 - x0}
          height={y1 - y0}
          rx="0.012"
          fill="var(--text)"
          stroke="var(--bg)"
          strokeWidth="0.036"
          paintOrder="stroke"
        />
      ))}
    </svg>
  )
}
