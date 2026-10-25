# Making it look good: aesthetics plan

**Status:** a plan for review. Nothing here is built yet; "Decisions" at the
end lists what to settle first.

The app works, but it looks like what it is: every screen built from the
same dark card, with ad hoc sizes. The goal is a garage tool that looks
deliberate and reads at a glance between sets, without getting slower,
heavier, or harder to use with chalky hands.

## Where it stands

- **No system behind the styles.** 12 different font sizes and 7 corner
  radii, picked one screen at a time. Spacing is mostly 8/10/12/14/16 by eye.
- **Little hierarchy.** Cards, lists and sections all share one weight, so
  the thing that matters on a screen (the next set, the next workout)
  doesn't stand out from the rest.
- **Small buttons break the app's own rule.** The 36px "small" button is
  used 48 times, under the 48px touch-target minimum in `CLAUDE.md`.
- **Amber means two things.** It's the brand colour and also the warning
  colour (restrictions, missing TMs, short sets), so warnings don't read as
  warnings.
- **No icons.** The tab bar and every action are words only.
- **Numbers aren't the hero.** Weights and reps, the thing you look at
  between sets, are body text with a bit of bold.
- **No feedback beyond the toast.** Logging a set changes a line of text
  and pops a toast; nothing in the set itself says "done".

## Constraints that stay

- Dark only, high contrast, readable at arm's length in a garage.
- Touch targets of 48px or more; nothing that only works on hover.
- No new dependencies, and nothing fetched from the network: it has to
  look the same offline. The iPhone's system font stays (SF Pro). Its
  rounded variant (`ui-rounded`) is built into Safari and costs nothing.
- Charts keep their validated colours.
- No sound. Movement stays small, and off for anyone with Reduce Motion on.

## 1. Foundations (tokens)

Everything else builds on these, so they come first.

- **Type scale:** six steps instead of twelve sizes. Caption 13, body 17
  (iOS's own body size), subhead 15, title 20, large title 28, and a
  display size for numbers (32–40, rounded, tabular). Weights at 400, 600
  and 700 only.
- **Numbers in SF Pro Rounded.** Weights, reps, timers and stats use
  `ui-rounded` with tabular figures, so they look like a training log and
  don't jiggle as they count.
- **Spacing:** a 4px grid (4, 8, 12, 16, 24, 32), used everywhere.
- **Radii:** three sizes: 8 (chips, inputs), 12 (buttons, rows), 16 (cards,
  sheets).
- **Surfaces:** three steps of lift (background, card, raised) plus a
  hairline border. Raised is for the current set and sheets.
- **Colour roles:**
  - **brand:** the amber, now only for primary actions and "you are here"
  - **warning:** its own colour, distinct from brand
  - **success:** green, for done and PRs
  - **danger:** red, for destructive actions only
  - **text:** three steps (primary, secondary, muted)
  - **identity:** each profile's own colour, as an accent (see Screens)
  - every pair checked for contrast, as the chart colours were

## 2. Icons

A small set of hand-drawn SVG icons in one consistent style (2px strokes,
rounded ends), inline in the code: no icon font, no library. About 15:

- tab bar: home, chart, people, settings
- actions: swap, skip, note, timer, check, plus, more, edit, trash
- status: PR star, warning

The tab bar gets icons over its labels. Actions keep their words where
words are clearer; icons help where space is tight (a set's row).

## 3. Components

Restyled once, so every screen picks them up:

- **Buttons:** primary (filled brand), secondary (tinted), quiet (text
  only) and destructive. The small size grows to 44–48px tall and gets
  less padding instead of less height.
- **Cards:** a consistent header row (title, optional action on the
  right) and padding from the spacing scale.
- **List rows:** iOS-style grouped lists for Profiles, Settings and the
  library, with chevrons and dividers inset from the left.
- **Chips and segmented controls:** one height, clearer selected state.
- **Steppers:** bigger − / + and a rounded number between them.
- **Sheets:** a grab handle at the top, a title row, and room for the home
  indicator.
- **Badges:** PR, 1+ and warning badges with icons, not just colour.
- **Empty states:** a short line and the one action that helps ("No
  workouts yet. Start one.").
- **Toast:** slimmer, with an icon, sitting just above the tab bar.

## 4. Screens

In order of how often they're looked at.

**Workout (most of the time spent in the app):**

- **The current set is the hero:** a raised card with the weight large in
  rounded numerals and the reps and target beside it. The ✓ is big and
  the Missed button sits next to it. Other sets are compact lines.
- **Logging a set** gives the row a quick green fill and check. The set
  number turns into the check, so done-ness is visible without reading.
- **Person tabs** carry each person's colour as a top bar, their progress
  as a thin bar, and their rest as a ring that empties.
- **The rest bar** becomes a full-width countdown in large numerals, and
  turns green when rest is up.
- **Exercise headers:** the lift name, then tier and TM as secondary text,
  and the fold chevron and set count aligned.
- **Accessories:** the open-slot boxes and group cards share one look.

**Workout summary:** stat tiles (weight moved with its change, sets and
reps, minutes), then PRs as a short list with star badges, then the rating
stars.

**Home:**

- **A "Today" card at the top:** who's up next, and on which day, with one
  Start button.
- **Each person's row** shows their week as dots, one per day (done,
  skipped, to do), in their own colour.
- **The backup prompt** becomes a slim banner instead of a full card.

**Week view:** day cards with a status chip and the main lifts' top sets
in rounded numerals; finished days collapse to one line.

**Progress:** a row of stat tiles at the top (best e1RMs), then charts with
consistent card headers. The compare chips match the person tabs.

**Start Week:** each person's recap as tiles, then the TM changes as
before-and-after numbers with an arrow.

**Program editor, profiles, settings and library:** grouped iOS-style
lists, consistent headers, and the reorder arrows as icon buttons.

## 5. Movement

Small and quick (150–200ms), and off with Reduce Motion:

- sheets slide up
- a logged set fills
- the rest ring empties
- a PR badge pops once

No page transitions: they'd slow down moving between tabs.

## 6. Identity

- **Wordmark:** "Wigwam531" in rounded type on Home, with a small mark.
- **App icon and splash screen:** redrawn to match (`scripts/make-icons.mjs`
  draws them, so this is a code change).
- **Profile colours:** used consistently as each person's identity: their
  tab, dots, compare chips and name chips.

## 7. Accessibility

- A contrast check for every text and colour pairing, like the chart
  palette got.
- Visible focus rings.
- **Larger iOS text sizes:** body text could follow the phone's text-size
  setting (Dynamic Type) through Safari's `-apple-system-body` font, so
  bigger text doesn't need zooming. See Decisions.
- Icons always paired with words or labels for screen readers.

## How it gets built

1. **A style page** (dev build only, like the demo data) showing every
   token and component, to review in the phone-size preview before any
   screen changes.
2. **Foundations and components**, applied across the app at once.
3. **Workout and its summary.**
4. **Home, week view and Start Week.**
5. **Progress, program editor, profiles, settings and library.**
6. **Icon, splash and wordmark.**

Each step: before-and-after screenshots at phone size, tests and build
passing, and a check on your phone. Nothing about how the app works
changes; this is look and feel only.

## Decisions

1. **How far:** polish the current look (same layout, cleaner system),
   or a bolder redesign of the workout and Home screens as described?
2. **Accent:** keep amber as the brand colour, or pick a new one?
3. **Rounded numbers** (SF Pro Rounded) for weights, reps and timers?
4. **Tab bar:** icons with labels, or icons only?
5. **Dynamic Type:** follow the iPhone's text-size setting? It's more
   accessible, but large settings would push more scrolling into the
   workout screen.
6. **App icon:** redraw it, or keep the current one?
