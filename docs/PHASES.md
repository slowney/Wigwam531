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

- **Schema:** Dexie version 2, with the tables from PLAN.md that this phase uses. Version 1 (settings only) shipped in Phase 0 and is already on the phone, so it can't be edited. Workout tables arrive in Phase 3 as version 3.
- **Seed data:** the exercise library (92 accessories) and the Home gym, from your equipment.
- **Profiles:**
  - create, edit, pick a color, and archive. Profiles are never deleted.
  - starting TMs can be typed in directly or calculated from a 1RM
  - a partner can follow you (one level deep) and copy your TMs
- **Ratings** come from a preset picked when a profile is created:
  - "Dumbbell-first, shoulder-safe" is the default for the first profile. Dumbbell accessories start at 4★. Upright rows, bench dips and behind-the-neck press/pulldown are hidden. Everything else stays unrated, which sorts as 3★.
  - partners start blank
- **Bodyweight log.**
- **Backup:** export through the share sheet, import with a confirmation step, and a backup reminder. The persistent-storage request already shipped in Phase 0.

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
- **Start workout:**
  - pick participants and the gym; each person's day defaults to their next pending one
  - a note appears when people are on different days
  - doing a later day doesn't skip an earlier one; End Week does that
- **Session:**
  - a tab per person
  - one-tap logging, a rep stepper, an AMRAP picker, and quick-rep buttons for rep ranges
  - "rotate after each set" passes the bar to the next person with sets left
  - warm-ups logged with a single tap per lift
  - undo, notes and RPE
  - a warning when a weight is more than the plates can load
- **Rest timer:**
  - each person gets their own countdown, which survives the app being killed
  - visual only, no sound (your call)
  - 3:00 after 1–3 rep sets at 80% of TM or more, 2:00 after other main-lift sets, 1:30 after accessories
  - keeps the screen awake during a workout
- **Changes:** swap any exercise for today, skip a day, end the week. A swapped-in lift with no TM runs its usual rep range, and the original lift's TM holds.
- **Accessories:** picked from the full library for now (suggestions arrive in Phase 4). Picks apply to followers in the session.
- **Double-progression prefill:** moved here from Phase 4 because the heavy row needs it. Rep-range work carries its weight over, and goes up once every set reaches the top of the range.
- **Finish:** PR badges (compared against earlier sessions only) and a finish summary showing next week's bumps
- **Recovery:** the session resumes after the app is killed mid-workout, and reopening the app lands back on it

**Added after the first real session:**

- day names that carry their lifts ("Day 2: Squat/Sumo")
- foldable exercises
- a whole-workout rating per person
- a backup prompt when a week finishes

**Done when:**

- A mock week for three profiles runs start to finish in the phone-size preview.
- You run a real garage session with it.
- Killing the app mid-set and reopening it resumes exactly where you were.

From here it can replace the nSuns app for main lifts.

## Phase 4: Accessory engine

- **Muscle maps:** reviewed, since every exercise already had one from Phase 2.
- **Weekly muscle targets:** defaults, plus editing per profile.
- **Open slots:** each day shows its open accessory slots. Pinning moved to Phase 5, with the program editor.
- **The picker:**
  - "behind this week" chips
  - sorted by rating, with a best-fit toggle
  - what each exercise hits and when you last did it
  - Fill all
- **Ratings:** stars and Hide, set from the ★ on a row, a profile's exercise-ratings list, or the session summary (which marks what's new).
- **Quick-add** of new exercises from the picker's search.
- **Restrictions:** lower back, shoulder impingement, overhead pressing, knees, elbows, or chosen muscles, each with an optional end date.

**Done when tests show:**

- After a stock nSuns week with no accessories, the behind muscles include back, biceps, rear delts and hamstrings, and never chest, quads, glutes, front delts or triceps.
- Within those muscles, a 5★ exercise always ranks above a 3★ one.
- Hidden exercises, and equipment the gym doesn't have, never appear.
- A lower-back restriction removes hinges and bent-over rows.
- Fill all puts each slot on a different gap while there are gaps without one.

…and you've used the suggestions for a real week and told me what felt
off.

**Added after first use:** a focus. Pick muscles to bias accessories
toward, as extra accessory sets a week, with an optional end date. See
PLAN.md.

## Phase 5: Program editor

- **Days:** add, remove, rename, duplicate and reorder (↑/↓), 1–7 days
- **Main slots:** exercise, TM source, scheme, tier and warm-ups, up to 3 per day. Progression follows the scheme: a ★ set moves its TM, a rep range uses double progression.
- **Custom schemes:** percent-of-TM schemes built set by set, with 1+ and ★ sets. Built-in ones can be copied, not changed.
- **TM increases:** each person's bump table per lift (0–1 / 2–3 / 4–5 / 6+ reps)
- **Accessory slots:** pinned and open, per day (pinning moved here from Phase 4). Pinned accessories are added to the workout when it starts.
- **Live edits:** changes apply immediately to the days still to do this week. An edit that would pull a day or a lift out from under today's workout is refused until it's finished.
- **Custom programs:** build one from scratch (pick a number of days) or from a copy, save it to My programs, and switch any profile to any program, when it's created or later. Followers come along when their leader switches; their per-lift changes don't.
- **Followers:** they see your program plus their own overrides; per-slot override, "Use Lead's again", and unfollow
- **Making it stick:** "make permanent" turns a today-only swap into a program edit
- **Accessories in the session:** sets × reps can be changed today, and start there next time
- **Library:** exercises added in the app can be edited or deleted (built-ins are view-only), plus set schemes and My programs

**Done when:**

- A test edits Day 3 mid-week. Day 3's plan changes; completed days and history don't.
- A follower's override survives the leader editing the same day.
- You restructure something real and train a week on it.

## Phase 5b: Garage feedback

From the first full week in the garage. The two bugs ship with Phase 5.

**Bugs:**

- **Tab bar drift.** After coming back to a workout, the bottom tab bar can float up into the page while scrolling. iOS loses track of `position: fixed` elements after the keyboard closes or the app resumes. The fix: the page itself no longer scrolls; the screen scrolls inside a fixed frame, and the tab bar sits in the layout instead of being pinned to the screen. Needs checking on the phone.
- **Set editor overflow.** The weight row in the set editor runs off the right edge, because the weight box wouldn't shrink to fit.

**Changes:**

- **Delete or reopen a finished workout**, from its summary.
  - Delete removes it and every set logged in it, and its days go back to to-do (skipped, if their week has ended). This is how dummy test workouts get cleared.
  - Reopen puts it back in progress with everything logged kept, for a workout finished too early. Not once the week has ended, or while another workout is going.
  - Neither undoes a TM change that Start Week has already made from it. The card says so.
  - **Finding one:** the Progress tab lists every finished workout until Phase 6's charts arrive, and each done day in the week view links to its workout.
- **Fail a set.** Fixed-rep sets keep the one-tap ✓ and get a "Missed" button that opens the rep picker from 0 up to the target. Short sets show their ✓ and "of 5" in amber. Progression rules don't change: TMs still move only on the ★ set, a failed set is never a PR, and a short accessory set just holds the weight.
- **Rep buttons for accessories**, the same as the heavy row: tap the reps you got. Tapping the set itself still opens the editor to change the weight. Ranges with more than three rep counts (8–12, 15–20) put their buttons on a line of their own instead of hiding behind a Reps button.
- **Accessories out of order.** Each accessory's next set is ready to log at any time, since accessories get done whenever the bar is busy. The main lifts keep their order, and the person's next set overall is still the one picked out in orange.
- **"+ New exercise" in the accessory picker** all the time, not only when a search finds nothing.
- **Accessory progression that actually moves.** The weight already carried over from last time, but it only went up once *every* set reached the top of the range, which accessories rarely manage. Now one set at the working weight reaching the top is enough: the next time that exercise is picked starts one step up (+5 lb on a bar, the next dumbbell, the next pin), and the exercise's header says "+5 from last time". The heavy row keeps the every-set rule.
- **Higher default weekly targets:** lats and side delts 14; chest, rear delts, biceps, triceps, glutes and hamstrings 12; quads and abs 10; calves down to 3. The rest are unchanged. Anyone who has changed a target keeps their own number.

**Done when:**

- Tests show:
  - deleting a workout puts its days back to to-do and leaves every other workout alone
  - a reopened workout finishes again correctly
  - a short set logs and shows as short
  - an accessory that hit the top of its range starts a step up next time, and one that didn't holds
- On your phone, the tab bar stays put after a workout resumes, and the set editor fits.

## Phase 6: Progress and metrics

The Progress tab becomes a page per person (chips at the top switch between them), with one range picker (3M / 6M / 1Y / All) for its charts.

- **Main-lift charts:** each lift's best e1RM per week (a lift done heavy one day and as a T2 another would zigzag workout by workout), the TM as a step line, PR rings, and a readout that follows a tap on the chart
- **Exercise detail**, for any exercise: e1RM (or top set, for timed holds) over time, bests, a rep-max table and the full history
- **PR board:** best e1RM and heaviest set per main lift, then every other exercise logged
- **Weekly muscle volume:** this week's sets against target per muscle; tap one for its last 8 weeks
- **Bodyweight chart**
- **Advanced toggle** (Edit profile): each lift ÷ bodyweight, the squat + bench + deadlift total from best e1RMs, and DOTS once sex is set
- **Workouts:** this person's finished workouts, below the charts
- **Compare** (added after first use): up to three people on shared main-lift charts, with a best e1RM table that also shows each against bodyweight. Three is the most whose colours stay tellable apart on every pair; each person keeps their colour while others are added or removed.
- **Charts** are hand-drawn SVG in the dark theme, no chart library. Two series colours, checked for colour-blind separation against the card surface.
- **Demo data** for checking the charts: "Load demo data" builds six months of made-up training for a Demo profile. It exists only in the dev build.

**Done when:**

- Charts render correctly from six months of generated data at phone size. (The app is dark-only, so there's no light mode to check.)
- They look right with your real data on your phone.

## Phase 7: Fewer taps, better summaries

From the list after Phase 6. Built:

- **Removing sets.** "Skip this set today" in any unlogged set's editor: the set stays visible to undo, but drops out of the count and the next-set order. For good: "Edit these sets" on a lift in the program editor opens your own copy of its scheme (or the scheme itself, if it's already yours) to remove rows.
- **Accessory groups.** Saved from a workout's accessories ("Save these accessories as a group") onto that program day, so followers get them too; a follower's group goes on the leader's day. In a workout, the day's groups sit above the accessory slots, ranked by the average "How was it?" rating of the workouts that used them (untried ones count as 3), plus up to one more for how much of the group works muscles behind this week. One tap adds the whole group (shared with followers, like picks). Groups can be removed in the program editor.
- **Deload and TM-test suggestions** at Start Week: a deload when two or more lifts have stalled two weeks running; otherwise, after six normal weeks, a deload or a TM test, taking turns. The suggestion comes preselected with its reason and can be changed.
- **Workout summary:** weight moved (weight × reps of working sets) against the last time that program day was done, sets and reps, duration, and each main lift's best e1RM against its last workout.
- **Weekly recap** at Start Week: PRs, weight moved against the week before, muscles on target, and each TM lift's best e1RM against the week before.
- **Compare on exercise pages:** up to three people on any exercise, with the same colours and rules as the main-lift comparison.
- Earlier quick wins from the same list: last time's note on each exercise, and − / + on a rep-range set's weight.

**Done when:**

- Tests show skipped sets leave the count and the next set, and a logged set can't be skipped; groups save to the leader's day, rank by rating and fit, and add to followers' workouts; the deload and TM-test rules; and the workout and week numbers.
- You use a group and a skipped set in a real workout.

## Phase 8: 5/3/1 waves, BBB and BBS

- **Wave schemes:** a percent scheme can hold a set list per week of a cycle. Built in: 5/3/1 (5s week 65/75/85%, 3s week 70/80/90%, 5/3/1 week 75/85/95%, each ending on a 1+ set), BBS (10 × 5 at that week's first-set percentage) and BBB (5 × 10 at 50% of the same lift, every week).
- **Where a week falls in the wave:** each person's normal weeks since their last deload or TM test. Those weeks don't advance it, so each cycle after one starts again at the 5s week. Deloads and TM tests stay on the every-six-weeks suggestion from Phase 7, which matches 5/3/1 Forever's "7th week".
- **Classic progression:** a TM run by the 5/3/1 scheme moves once a cycle, +5 upper body or +10 lower, after the 5/3/1 week, and only if every 1+ set that week made its reps. Otherwise it holds, and Start Week says why. A TM that a weekly ★ set also drives stays on the nSuns rule.
- **Mixable:** waves are ordinary schemes, so they can go on any day of any program alongside nSuns lifts.
- **Presets:** 5/3/1 BBB 4-day and 5/3/1 BBS 4-day (OHP, deadlift, bench and squat days, supplemental on the same lift).
- **Showing it:** the workout, week view and lift sheet show the wave week ("3s week"); the scheme editor has a tab per wave week; day labels name a lift once ("Day 1: OHP"); the week view counts runs of identical sets ("65×5 (×10)").

**Done when:**

- Tests show the waves' weights for each week, BBB and BBS, TM-test weeks testing a cycle-run TM, and a full three-week cycle that holds TMs for two weeks and then steps them up.
- You run a cycle of one of them for real.

## Day focus (after Phase 8)

- **What:** accessory suggestions follow each day's upper/lower lean: Upper, Lower, Posterior (hinge muscles plus back and pulling) or Full. The day's first main lift decides it unless the program editor sets one.
- **Effect:** today's muscles lead the chips, the list, Fill all and group ranking; other muscles stay, dimmed. Posterior days put exercises that spare the lower back first.

**Done when:**

- Tests cover the automatic focus, the ordering, Fill all staying on today's muscles, lower-back-sparing on Posterior days, and setting a focus by hand.
- A real week's accessories feel like they match each day.

## T2s and PRs (after day focus)

- **T2s:** the built-in T2s become a warm-up ramp plus three sets of 6–8 at nSuns's top percentage, still off the TM. The eight-set originals stay as "classic". Percent sets can carry a rep range, and percent schemes a ramp.
- **PRs:** a set only earns a badge if it beat its prescription.
- **TMs from 1RMs:** setup defaults to 1RMs; editing a TM can take a 1RM too.

**Done when:** a week of T2s feels right, and PR badges show up on sets that earned them.

## Later

- plate calculator (the plate inventory is already stored)
- combined group view (sets ordered by weight, who's up next)
- partners logging on their own phones (needs a sync backend): planned in [SYNC.md](SYNC.md), to go over before scheduling
- typing in past TMs so the charts don't start empty
- kg
