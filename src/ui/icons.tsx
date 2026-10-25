// The app's icons: hand-drawn on a 24px grid, 2px strokes, rounded ends,
// in the text colour. Inline, so there's nothing to download or cache.

const PATHS = {
  home: 'M4 11 12 4l8 7M6 9.5V20h4.5v-5h3v5H18V9.5',
  chart: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2 .8 3 3.3 3 6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1',
  check: 'M5 12.5 10 17.5 19.5 7',
  plus: 'M12 5v14M5 12h14',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  skip: 'M6 6l12 12M18 6 6 18',
  note: 'M5 19h3.5L19 8.5 15.5 5 5 15.5V19ZM13.5 7 17 10.5',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 2M9.5 2.5h5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z',
  warning: 'M12 4 21 19.5H3L12 4ZM12 10v4.5M12 17.2v.1',
  chevron: 'M9 5l7 7-7 7',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  barbell: 'M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8',
} as const

export type IconName = keyof typeof PATHS

/** An icon at the current text size and colour. Decorative unless given a label. */
export function Icon({ name, size = '1.25em', label }: { name: IconName; size?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
