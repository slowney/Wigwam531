# Build phases

Read a phase's section before starting on it. Phases run in order, and a
phase is done when every item on its "done when" list is true. Design
details are in [PLAN.md](PLAN.md).

**Verification, every phase:**

- `npm test` runs the engine tests without a browser. Every rule added comes with a test.
- Claude can also drive the app at phone size in the desktop app's browser pane.
- Claude can't touch your iPhone. You check these on the phone: installing, opening offline, the screen staying awake, sound, and the share sheet. Each phase says when that's needed.

## Phase 0: Tooling and skeleton

- Vite + React + TypeScript with pinned versions. `npm test` runs Vitest.
- PWA manifest, icons and service worker. Hash routing, and a shell with a bottom tab bar (Home / Progress / Profiles / Settings).
- Dexie wired up with a placeholder table.
- A GitHub Actions workflow that deploys to Pages on every push to `main`.
- `CLAUDE.md` holding the rules from PLAN.md:
  - the engine stays pure
  - plans are calculated, logs are stored
  - exercise IDs never change
  - lb only

**One-time setup for you:** in the repo, go to Settings → Pages and set
Source to "GitHub Actions".

**Done when:** on your iPhone, the app installs from Safari, opens in
airplane mode, and a test counter keeps its value after closing and
reopening the app.

## Phase 1: Engine

Pure TypeScript in `src/engine/`:

- rounding to 5 lb, and converting a 1RM to a TM
- the scheme model (% × reps, AMRAP, progression set, rep-range sets) and the nSuns 4-day schemes
- the program model: days, main slots (exercise, TM source, scheme, tier, progression type), accessory slots, and follow + per-slot overrides
- two presets: nSuns 4-day, and nSuns 4-day + heavy row (Day 1, 4 × 6–8 double progression)
- week planning: program + TMs + week type → every prescribed set, for normal, deload and TM-test weeks
- AMRAP progression table, TMs that hold when a lift is skipped, and stall detection
- double progression
- warm-up generator
- e1RM and PR detection
- weekly muscle volume (logged + planned)
- a check that a weight can actually be loaded with the gym's plates

The engine is pure, so this phase can be built while Phase 0's phone check
is still pending.

**Done when:**

- A fixture pins every weight of a full nSuns 4-day week for one set of TMs, and you've checked it against your nSuns app.
- Progression tests cover 0 to 10+ reps, a skipped day, and two stalls in a row.
- Warm-ups handle a TM so light that they collapse to just the bar.
- A follower picks up a change to the leader's program but keeps their own overridden slot.

## Phase 2: Data and profiles

- Dexie schema v1 (tables in PLAN.md)
- the exercise library and the Home gym, seeded with your equipment
- profiles: create, edit, pick a color. Starting TMs can be typed in directly or calculated from a 1RM. A partner can follow you and copy your TMs.
- your seeded ratings: dumbbell accessories 4★, everything else 3★; upright rows, bench dips and behind-the-neck press/pulldown hidden
- bodyweight log
- export through the share sheet, import with confirmation, a backup reminder, and a persistent-storage request

**Done when:**

- A test exports a seeded database, wipes it, re-imports it, and gets identical data back.
- On your phone, an export lands in Files and imports back.

## Phase 3: Workout flow (garage-ready version)

- **Home:** a card per profile
- **Start Week:**
  - progression review per profile, several at once
  - stall warnings
  - normal, deload or TM-test week
- **Week view**
- **Start workout:** participants, gym, each person's day, and a prompt when people are on different days
- **Session:**
  - a tab per person
  - one-tap logging, a rep stepper, and an AMRAP picker
  - warm-ups, undo, notes and RPE
  - a warning when a weight is more than the plates can load
- **Rest timer:** keeps the screen awake and plays a sound
- **Changes:** swap any exercise for today, skip a day, end the week
- **Accessories:** picked from the full library for now (suggestions arrive in Phase 4). Picks apply to followers in the session.
- **Finish:** a PR badge and a finish summary
- **Recovery:** the session resumes after the app is killed mid-workout

**Done when:**

- A mock week for three profiles runs start to finish in the phone-size preview.
- You run a real garage session with it.
- Killing the app mid-set and reopening it resumes exactly where you were.

From here it can replace the nSuns app for main lifts.

## Phase 4: Accessory engine

- a muscle map for every exercise in the library
- weekly muscle targets (defaults, plus per-profile editing)
- flex slots (and pinned, though unused by default)
- the picker:
  - "behind this week" chips, sorted by rating, with a best-fit toggle
  - Fill all
- star ratings and Hide, with a prompt to rate new exercises at session end
- quick-add of new exercises from the picker
- injury restrictions and the shoulder-risk tag
- double-progression prefill

**Done when tests show:**

- After a stock nSuns week with no accessories, the "behind" muscles are back, biceps, rear delts and hamstrings.
- Within those muscles, a 5★ exercise always ranks above a 3★ one.
- Hidden exercises, and equipment the gym doesn't have, never appear.
- A lower-back restriction removes hinges and bent-over rows.
- Fill all spreads three slots across three gaps unless one gap is big enough to need more.

…and you've used the suggestions for a real week and told me what felt
off.

## Phase 5: Program editor

- **Days:** add, remove and reorder (3–5 days)
- **Main slots:** exercise, TM source, scheme, tier and progression type, up to 3 per day
- **Custom schemes**
- **Accessory slots:** pinned and flex, per day
- **Live edits:** changes apply immediately to the pending days of the current week
- **Followers:** they see your program plus their own overrides; per-slot override, and unfollow
- **Making it stick:** "make permanent" turns a today-only swap into a program edit
- **Library:** editing exercises in the library

**Done when:**

- A test edits Day 3 mid-week. Day 3's plan changes; completed days and history don't.
- A follower's override survives the leader editing the same day.

## Phase 6: Progress and metrics

- **Main-lift charts:** e1RM, TM steps, PR markers, and a range picker
- **Exercise detail:** a rep-max table and history
- **PR board**
- **Weekly muscle volume:** the last 8 weeks
- **Bodyweight chart**
- **Advanced toggle:** each lift ÷ bodyweight, SBD total, and DOTS

**Done when:**

- Charts render correctly from six months of generated data at phone size, in both light and dark mode.
- They look right with your real data on your phone.

## Later

- plate calculator (the plate inventory is already stored)
- combined group view (sets ordered by weight, who's up next)
- partners logging on their own phones (needs a sync backend)
- typing in past TMs so the charts don't start empty
- classic 5/3/1 three-week waves
- kg
