# Wigwam531 — Plan

A 5/3/1 training log for a garage gym, run from an iPhone. It starts from
nSuns 4-day, but nothing about the program is hard-coded: main lifts, days,
set schemes and accessories can all be edited, and one phone logs everyone
training that day.

- App: https://slowney.github.io/Wigwam531/ (once Phase 0 ships)
- Code: https://github.com/slowney/Wigwam531
- Build order: [PHASES.md](PHASES.md)

## What this fixes

| nSuns app problem | How Wigwam531 handles it |
|---|---|
| Changing the split only takes effect after starting a new week | Upcoming workouts are recalculated from the program and current TMs every time they're shown. Edit the program or a TM and the rest of this week updates immediately. Only completed sessions are frozen. |
| Main lifts can't be changed | Any exercise can go in any main slot, with any set scheme and its own TM. A day can have a third main slot, e.g. a heavy row. |
| Accessory selection is clunky | Each day has 3 open slots. Tapping one lists exercises for the muscles you're behind on this week, sorted by your own star ratings. One tap fills every slot. Adding something new you saw online takes about 15 seconds, mid-workout. |
| No multi-user support | Everyone has their own profile, TMs and week. Partners follow your program by default and can break off on any lift where their strengths differ. One phone logs the whole group. |
| Busy weeks | Workouts aren't tied to calendar days. Skip a day and that lift's TM stays where it is. Days can be done out of order. |

## Decisions

- **Name:** Wigwam531.
- **Platform:** installable web app (PWA) on the iPhone home screen. It works offline and is hosted on GitHub Pages.
- **Group mode:** one phone logs everyone. Partners follow your program but have their own TMs. Syncing to partners' phones comes later.
- **Progression:** weekly nSuns TM bumps based on the 1+ set.
- **Data:** stored on the phone, with JSON backup to Files or iCloud Drive.
- **Units:** pounds for everyone. Weights round to 5 lb.
- **Accessories:** flex slots by default with no pinning, sorted by star rating, quick to add new ones. Dumbbell work is favored. Upright rows, bench dips and behind-the-neck press/pulldown are hidden.
- **In v1:** rest timer, warm-up sets, injury swaps, PR board with estimated 1RM (e1RM), bodyweight log, deload and TM-test weeks, set notes and RPE.
- **Not in v1:** plate calculator, combined group view (sets ordered by weight) and multi-device sync. The data model leaves room for all three.
- **History:** the nSuns app has no export, so history starts fresh. You type in your current TMs once at setup.

## The garage

The starting equipment list for the "Home" gym. Every item can be edited in
Settings.

| | |
|---|---|
| Bars | 45 lb barbell, trap bar, EZ bar |
| Plates | one pair each of 45, 35, 25, 15, 10, 5 and 2.5. That's a 320 lb maximum on the barbell; the app warns when a prescribed weight is more than that |
| Rack | Major Fitness F22: J-hooks, safety arms, multi-grip pull-up bar, dip bars, 360° landmine |
| Cables | dual height-adjustable pulleys at a 2:1 ratio. Weights are logged as the number on the stack (10 lb steps). Lat bar, straight bar, stirrup handles, T-bar handle |
| Bench | adjustable (flat / incline) |
| Dumbbells | 5–55 lb in 5 lb steps |
| Other | adjustable kettlebell (5–40 lb), band set, ab wheel, ab mat. Trap bar 45 lb, EZ bar 20 lb |

## Core concepts

- **Profile:** one person. Holds their program, TMs, bodyweight log, exercise ratings, weekly muscle targets and any active injuries.
- **Gym:** an equipment list. "Home" is the default, and others (a hotel gym, a friend's garage) can be added. Suggestions only include exercises the gym can support.
- **Exercise:** a library entry. It records:
  - the equipment it needs
  - its movement pattern
  - the muscles it works (primary or secondary)
  - its load type
  - its default sets and rep range
  - how hard it is on the lower back
  - tags such as "shoulder impingement risk"

  Its ID never changes once anything has been logged against it. You can add your own exercises at any time.
- **Template / program:** templates are starting points ("nSuns 4-day", "nSuns 4-day + heavy row"). A profile's program either is its own copy of a template, or *follows* another profile's program (see Group training).
- **Training max (TM):** kept per profile and per lift. Every change is saved with its reason: start, progression, manual, reset or TM test.
- **Week:** one pass through the program's days for one profile. Normal, deload or TM test.
- **Session:** one trip to the garage: who was there, which gym, when.
- **Entry:** one person's workout within a session, i.e. which week and day they did.
- **Set:** one logged set. It holds the exercise, the prescribed and actual weight and reps, AMRAP and warm-up flags, RPE and a note.

**The rule everything hangs on: plans are calculated, logs are stored.** A
day's prescribed sets are never saved ahead of time. They're worked out from
the program, the TMs and the week type whenever they're shown. Once a set is
logged it's stored with both the prescribed and the actual numbers, so later
program edits never rewrite history.

## Programming

### nSuns 4-day preset

| Day | T1 (9 sets) | T2 (8 sets) |
|---|---|---|
| 1 | Bench | OHP |
| 2 | Squat | Sumo deadlift (uses the deadlift TM) |
| 3 | OHP | Incline bench (uses the bench TM) |
| 4 | Deadlift | Front squat (uses the squat TM) |

Schemes, as % of TM × reps (`+` = AMRAP, ★ = the set that drives
progression):

| Scheme | Sets |
|---|---|
| T1 bench | 75×5, 85×3, **95×1+ ★**, 90×3, 85×5, 80×3, 75×5, 70×3, 65×5+ |
| T1 squat / OHP | 75×5, 85×3, **95×1+ ★**, 90×3, 85×3, 80×3, 75×5, 70×5, 65×5+ |
| T1 deadlift | 75×5, 85×3, **95×1+ ★**, 90×3, 85×3, 80×3, 75×3, 70×3, 65×3+ |
| T2 OHP | 50×6, 60×5, 70×3, 70×5, 70×7, 70×4, 70×6, 70×8 |
| T2 sumo | 50×5, 60×5, 70×3, 70×5, 70×7, 70×4, 70×6, 70×8 |
| T2 incline | 40×6, 50×5, 60×3, 60×5, 60×7, 60×4, 60×6, 60×8 |
| T2 front squat | 35×5, 45×5, 55×3, 55×5, 55×7, 55×4, 55×6, 55×8 |

These come from the published nSuns spreadsheet as best I know it. **Check
them against your nSuns app before Phase 1 is signed off.** The Phase 1
tests pin every weight of a full week, and that fixture becomes the
correctness check, the same way the 2023 sheet is for the fantasy bot.

A TM starts at 90% of a 1RM, or you can type it in directly. The easiest
start is to copy your current TMs from the nSuns app. Weights round to the
nearest 5 lb.

### Progression

At Start Week, every lift with a ★ set gets a suggested bump from its last
1+ result:

| 1+ set reps | Bench / OHP | Squat / Deadlift |
|---|---|---|
| 0–1 | +0 | +0 |
| 2–3 | +5 | +5 |
| 4–5 | +5 | +10 |
| 6+ | +10 | +15 |

The table can be edited per lift and per person, and every bump can be
changed before it's applied. If a lift's 1+ set gets 0–1 reps two weeks in a
row, Start Week suggests resetting that TM by 10%. That's only a suggestion;
nothing changes until you tap to apply it.

### Weeks, skipping and order

- Each profile has its own week. "Next workout" is that person's first pending day, but any pending day can be picked.
- A day can be skipped. If a lift's ★ set wasn't done that week, its TM stays the same.
- When every day is done or skipped, the profile's card on the home screen offers **Start Week N+1**. "End week" is available at any time to skip whatever is left.
- Group sessions usually line up. If a partner missed Day 2, they're offered Day 2 next and a note shows that they're on a different day. They can catch up on it while everyone else does Day 3, or pick Day 3 to stay with the group. Day 2 then stays open until they do it, or End Week skips it.

### Deload and TM-test weeks

Picked at Start Week instead of a normal week.

- **Deload:** main lifts at 40/50/60% × 5, 2 accessory slots by default, and no progression.
- **TM test:** main lifts at 70/80/90/100% × 5. The 100% set should get 3–5 clean reps. If it doesn't, the app suggests a lower TM.

### Swaps and injuries

- **Swap for today:** any exercise in a session can be swapped. If the replacement has its own TM, it runs the same scheme. Otherwise you pick a weight and it runs a short 3–5 set scheme. The original lift's TM stays the same that week. **Make permanent** turns the swap into a program edit.
- **Injury restriction:** on a profile, add a restriction, either until it's removed or for 1, 2 or 4 weeks. Suggestions skip anything it covers, and main lifts it covers get a warning and a swap button.
  - **Lower back:** anything that loads it.
  - **Shoulder impingement:** the risk-tagged lifts.
  - **Overhead pressing:** overhead presses and extensions; landmine presses and dips stay.
  - **Knees:** squats and lunges.
  - **Elbows:** exercises that mainly work biceps, triceps or forearms.
  - **Pick muscles:** your own list.

### Warm-ups

Before each T1: bar × 10, then 40% × 5, 50% × 5 and 60% × 3 of TM. A warm-up
is dropped if it would be lighter than the bar or within 10 lb of the first
working set. T2s get none by default, which can be changed per slot.
A lift's warm-ups are logged with a single tap, and they don't count toward
volume or PRs.

### Heavy row

Every main lift in stock nSuns 4-day is a press, squat or hinge; there's no
horizontal pull. The heavy row goes in as a **third main lift on Day 1**
(Bench / OHP), for three reasons:

- it works the muscles opposite to bench
- your lower back is still fresh
- two workouts sit between it and deadlifts

Day 3 is the worst place for a heavy barbell row because deadlifts come
next. If you want back work twice a week, a chest-supported dumbbell row on
Day 3 stays off the lower back.

Default scheme: **barbell row 4 × 6–8 with double progression.** Pick a
weight you can row for 4 × 6 with clean form. When all four sets reach 8,
add 5 lb. A rep range keeps rows honest: once the weight outruns your form,
the reps stop coming, and that's your cue to hold. If you'd rather drive it
from a TM, a "5 × 5 with an AMRAP last set off a row TM" scheme is one
setting away.

## Group training

Your partners mostly follow your lead and lift similar weights, but this is
a chance to let them diverge where their strengths differ.

- **Follow by default.** A partner's program follows yours: same days, same main lifts, same schemes. When you edit your program, their plan updates too.
- **Their own numbers.** Each person has their own TMs, weeks, progression table, ratings and bodyweight. A new partner can start by copying your TMs and then adjust them. From there each person's 1+ sets move their own TMs, so their numbers drift apart on their own.
- **Diverge per slot.** A follower can override any single slot, e.g. trap bar instead of conventional deadlift, or a slower bench progression table. Overrides survive your later edits to the rest of the program. "Unfollow" turns their program into an independent copy.
- **Shared accessories.** In a group session, an accessory you pick is applied to everyone following you by default. Each person's weight prefills from their own history, and anyone can swap theirs out.

## Accessory engine

### Muscle groups and volume

There are 16 groups: chest, front delts, side delts, rear delts, lats, upper
back, lower back, biceps, triceps, forearms/grip, abs, glutes, quads,
hamstrings, adductors and calves.

Each exercise lists the muscles it works: 1.0 for a primary muscle, 0.5 for
a secondary one. Every working set adds those weights to each muscle's
weekly count. Main lifts count too; a T1 bench day is 9 chest sets. That's
why chest and quads usually look covered, and suggestions lean toward back,
arms, delts and hamstrings, the usual nSuns gaps.

Each profile has a weekly target per muscle, editable per profile. The
defaults (raised after the first garage week) are mostly 10–14 sets:
lats and side delts 14; chest, rear delts, biceps, triceps, glutes and
hamstrings 12; quads and abs 10; front delts 6; lower back, forearms and
adductors 4; calves 3, since the garage has no good way to train them. A
stock week leaves more to fill than three open slots a day hold, so
something is always behind and a focus decides what comes first.

### Focus

A focus biases accessories toward chosen muscles for a while. You can use a
preset (bench press, overhead press, squat, deadlift, pull-ups, arms,
glutes, shoulders, back, core) or pick muscles yourself.

- **Extra accessory sets:** each focused muscle wants extra accessory sets a week: "a little" (+3, about one more accessory), "more" (+6) or "a lot" (+9).
- **Why extra sets, not a higher target:** main lifts already give chest, triceps or glutes far more than their targets, so a bigger target would never show them as behind.
- **Bigger gap wins:** a focused muscle that's behind on its normal target anyway keeps whichever gap is bigger.
- **Priority:** focused muscles sort first in the picker's chips and in Fill all until their extra sets are in. The rest of the week goes back to the usual gaps.
- **How long:** a focus runs until removed, or for 4, 8 or 12 weeks. Overlapping focuses take the larger extra.
- **Default:** none, so suggestions follow the weekly targets as before.

### Ratings

Each person rates exercises from **1 to 5 stars**, or **Hide** them.

- **Unrated:** counts as 3★ and carries a "new" tag. The session summary asks you to rate anything new you tried.
- **Presets:** a new profile starts from a rating preset.
  - **Yours, "Dumbbell-first, shoulder-safe":** dumbbell accessories start at 4★, and upright rows, bench dips and behind-the-neck press/pulldown start hidden. Everything else stays unrated.
  - **Partners** start blank.
- **Editing:** you can change any rating from the person's exercise-ratings list, from the ★ on a suggestion's row, or from the session summary. There's no long-press: it fights the text-selection menu in iPhone home-screen apps.
- **Discomfort:** an exercise that's fine light but bothers a joint gets 1★. It sinks to the bottom of suggestions without disappearing, so no separate penalty is needed.

### How a slot gets its suggestions

1. **Projected volume** = sets already logged this week + sets still planned this week. Planned sets are the main lifts on pending days, any pinned accessories, and accessories already chosen today.
2. **Behind this week:** every muscle under its target, biggest gap first, shown as chips at the top of the picker. The list holds exercises that hit at least one of them; tap a chip to narrow it to that muscle.
3. **Filtered out:** anything the gym can't support, anything hidden or caught by a restriction, and anything already in today's session.
4. **Sorted by your rating**, 5★ first. Ties go to whichever covers more of the gap, then whichever you've done least recently. A toggle switches to "best fit" (gap coverage weighted by rating) for days you want the app to steer.
5. **Each row shows** the name, its stars, what it hits (`Rear delts 2/8 · Biceps 0/8`) and last time (`Oct 14 · 35 × 12, 12, 10`). Searching the full library is always one tap away.

**Fill all** works one slot at a time.
- Each slot goes to the biggest gap that hasn't had a slot today, counting accessories already picked by hand, and takes that gap's top-rated exercise.
- That exercise's sets go into projected volume before the next slot looks again.
- A muscle gets a second slot only once every gap has one.
- "Biggest gap" alone wasn't enough: a chin-up's half set of biceps shrinks the biceps gap, so lats would win the next slot too.
- When followers are training, Fill all's picks go to them as well, the same as a single pick.

A row hard on the lower back carries a small "deadlifts next" note when the
next day is a squat or deadlift day. It's a note, not a penalty; your
ratings still decide the order.

### Adding new exercises

Typing in the picker's search box offers **Add "cable Y-raise"**. That opens
a short form:

- equipment (tap chips)
- primary and secondary muscles (tap chips)
- sets and rep range (pre-filled with 3 × 8–12)
- an optional shoulder-risk tag

Saving it puts it straight into the slot. Everything can be refined later in
the library.

### Slots and rep ranges

- **Flex slots** are filled at the workout from suggestions: 3 per day by default, set per day in the program editor. This is the default setup, since you pick by feel.
- **Pinned slots** run the same exercise every time that day comes around. They're put into the workout when it starts, like a pick made by hand, so they can be resized or dropped for that day without touching the program. Your default program doesn't use them.
- **Rep ranges:** each exercise carries its own default. Most are 3 × 8–12. Light isolation work (lateral raises, face pulls, calves) is 3 × 15–20. Heavier dumbbell and cable compounds (DB rows, split squats) are 3 × 6–10. Sets × reps can be changed in the session, and each person's change is where that exercise starts for them next time.

### Accessory progression

Accessories use double progression within the exercise's rep range. The
weight prefills from last time. Once any set at that weight reaches the
top of the range, the next time the exercise is picked it starts one step
up, and the workout says so ("+5 from last time"):

- barbell: +5 lb
- dumbbell: the next pair (+5 lb)
- cable: the next pin on the stack
- kettlebell: the next setting

One set is enough because accessories rarely get every set to the top
before fatigue does. The heavy row keeps the stricter rule (every set at
the top), since the range is what keeps a heavy barbell row honest. A
failed set (no reps) doesn't count toward the working weight.

## Progress tracking

- **Main lifts:** e1RM per session (best set, Epley formula, 10 reps or fewer), the TM as a step line, PR markers, and a range picker (3M / 6M / 1Y / all).
- **Any exercise:** top set, e1RM, weekly tonnage, a history list, and a rep-max table (best weight at 1–10 reps).
- **PRs:** a badge appears as you log a rep PR at a given weight, a new e1RM PR, or your heaviest weight yet. Sets are compared against earlier sessions only; an nSuns pyramid climbs within a session, so comparing against today's earlier sets would badge nearly everything. Each profile has a PR board.
- **Muscle volume:** sets per muscle this week against target, plus the last 8 weeks.
- **Bodyweight:** a log and a chart.
- **Advanced (toggle per profile):** each lift ÷ bodyweight, SBD total, and DOTS (needs sex and bodyweight).

## Screens

- **Home:** a card per profile showing their week number, next day, a Start Week button when the week is done, and a backup reminder. A big **Start workout** button.
- **Start workout:** pick participants (the last group is preselected) and the gym. Each person's day defaults to their next one.
- **Session:**
  - **Header:** a tab per person showing their progress and their own rest countdown. "Rotate" moves to the next lifter after each logged set.
  - **Rest:** visual only: 3:00 after 1–3 rep sets at 80% of TM or more, 2:00 after other main-lift sets, 1:30 after accessories.
  - **Logging:** tap ✓ to log a set as prescribed, or "Missed" to pick the reps you got, down to 0. Rep ranges get a button per rep count. AMRAP sets get a big rep picker. Tapping the set itself opens the editor for weight, reps, RPE and a note.
  - **Out of order:** the main lifts run in order, but each accessory's next set is always ready to log, since accessories get done whenever the bar is busy.
  - **Per set:** swap, notes and RPE.
  - **Accessories:** slots with the picker, plus Fill all.
  - **Exercises fold.** Tap a header to fold an exercise to one line. Finished ones fold themselves unless opened by hand, and the choice is saved with the workout.
  - **Finish:** a summary with PRs, next week's bumps, a 1–5 "How was it?" rating per person, and (in Phase 4) ratings for any new exercises.
- **Day names** carry their main lifts everywhere: "Day 2: Squat/Sumo".
- **Start Week:** per profile, the last 1+ results, suggested bumps (editable), stall warnings and the week type. Several profiles can be started at once.
- **Week:** all of a profile's days with weights and done/skipped status.
- **Program editor** (from a profile's "Edit program"):
  - **Days:** add, rename, duplicate, remove and reorder with ↑/↓. Days named "Day N" renumber when moved; renamed ones keep their name.
  - **Main lifts:** up to 3 a day, each with its exercise, tier, sets and reps (any rep range, or a percent scheme), whose TM the percentages use, and warm-ups. Progression follows the scheme: a ★ set moves its TM, a rep range uses double progression.
  - **Accessories:** pinned exercises and the number of open slots, per day.
  - **When changes apply:** straight away, to the days still to do this week. History keeps what was prescribed. An edit that would pull a day or a lift out from under today's workout waits until it's finished.
  - **Followers** see the leader's program with their own changes on top: "Change for me" on any lift, "Use Lead's again", or unfollow to take a copy of their own.
  - **Whole program:** switch to a preset, one of My programs, a copy of someone's, someone to follow, or empty days to build from scratch. Save the current one to My programs. Followers come along when their leader switches; their per-lift changes don't.
- **TM increases:** per profile and lift, how much the TM goes up for 0–1 / 2–3 / 4–5 / 6+ reps on the ★ set.
- **Progress:** charts and the PR board, per profile (Phase 6). For now, every finished workout, newest first, each opening its summary.
- **Profile:** TMs, bodyweight, ratings, muscle targets, injuries, who they follow, and the advanced-metrics toggle.
- **Settings:** gyms and equipment, the library (exercises, set schemes, My programs), rest timer and warm-up defaults, backup and restore. Exercises and schemes made in the app can be changed or deleted while nothing uses them; built-in ones can be looked at, and schemes copied.

Session screen sketch (TM 225 bench):

```
+--------------------------------------------+
| Sean 7/22 | Alex 5/22 | Jo 6/22            |
| REST 1:42  -  done at 6:41                 |
+--------------------------------------------+
| BENCH  T1  TM 225                          |
|   ✓ 170 x 5                                |
|   ✓ 190 x 3                                |
|   ▶ 215 x 1+        [ - ]  4  [ + ]   [✓]  |
|     205 x 3                                |
|     ...                                    |
| OHP  T2  TM 135                            |
| ROW  T3  4 x 6-8 @ 165                     |
| ACCESSORIES                    [Fill all]  |
|   [ + ]  Biceps 0/8 · Rear delts 2/8       |
|   [ + ]                                    |
|   [ + ]                                    |
+--------------------------------------------+
```

## Architecture

### Stack

- Vite + React + TypeScript (strict)
- vite-plugin-pwa (Workbox) for the manifest, the offline cache and the update prompt
- Dexie (IndexedDB) with `useLiveQuery` for reactive data; no separate state library
- React Router with hash routing, because GitHub Pages has no fallback route for single-page apps
- Recharts for charts
- Vitest for tests
- Plain CSS with variables: a dark theme by default, touch targets of 48px or more, usable one-handed with chalk on your hands

Exact versions are pinned in Phase 0.

### Layout

```
src/engine/  pure TypeScript: schemes, planning, progression, warm-ups,
             e1RM, PRs, volume, suggestions. No React, no IndexedDB.
src/db/      Dexie schema, migrations, export/import. The only code
             that touches IndexedDB.
src/data/    seed data: exercises, schemes, templates, the Home gym
src/ui/      screens and components
tests/       engine tests and fixtures
```

The engine is pure, so it can be fully tested without a browser or a phone.
It's the same split as `stats.py` versus everything downstream in the
fantasy bot.

### Data model (IndexedDB)

| Table | Holds |
|---|---|
| profiles | name, color, sex (optional, for DOTS), muscle targets, progression tables, metric toggles |
| bodyweights | profileId, date, lb |
| gyms | name, equipment tags, dumbbell weights, plates, bars, cable stack steps |
| exercises | custom exercises (built-ins ship in code) |
| schemes | custom percent schemes (built-ins ship in code) |
| programs | profileId, followsProfileId, days → main and accessory slots, slot overrides |
| templates | My programs: saved programs that profiles start from or switch to, each getting its own copy |
| trainingMaxes | profileId, exerciseId, lb, date, reason |
| weeks | profileId, number, type, per-day status, when it was completed and ended |
| sessions | date, gymId, participants, notes |
| entries | sessionId, profileId, weekId, day, status, today's swaps and accessories, rest countdown, folded exercises, notes, workout rating |
| sets | entryId, profileId, exerciseId, role, prescribed and actual weight/reps, AMRAP, warm-up, RPE, note, time |
| ratings | profileId, exerciseId, stars or hidden |
| restrictions | profileId, muscles/patterns/tags, note, until |
| settings | app-wide settings, last backup |

`sets` is flat on purpose, since every chart and PR is a query by profile
and exercise. Three people training four days a week log about 20k sets a
year. IndexedDB and in-memory math handle that easily, so PRs, e1RM and
volume are calculated when read instead of being stored.

### Data safety

- **Saved immediately:** every logged set is written as soon as you log it. Killing the app, reloading or updating mid-workout resumes exactly where you were.
- **Fixing mistakes:** undo the last set, or edit any past session. A finished workout can be reopened (everything logged kept) or deleted (its sets go, and its days go back to to-do). Neither undoes a TM change Start Week has already made.
- **Backup:** Export sends a JSON file through the share sheet to Files or iCloud Drive, and Import restores it.
  - **When a week finishes:** a backup is offered on that workout's summary, after End Week, and on Home. "Not now" holds it until the next week finishes.
  - **Overdue:** Home also reminds you if there has never been a backup or the last one is more than a week old, until one is saved.
- **Persistent storage:** the app asks iOS not to clear its storage (`navigator.storage.persist()`).
- **Schema changes:** they add fields; existing fields are never renamed or given a new meaning. Exports carry a schema version, and old exports are migrated on import.

### iPhone PWA realities

| | On iPhone | What the app does |
|---|---|---|
| Install | Safari → Share → Add to Home Screen | a one-time instructions screen |
| No signal in the garage | the service worker caches the whole app | fully offline |
| Storage | separate from Safari; deleted if the home-screen icon is deleted | backups and a reminder |
| Rest timer | no background timers or local notifications without a push server | keeps the screen awake during a session; flashes when rest is up (visual only, no sound); shows the clock time the rest ends |
| Vibration | not supported | visual and sound cues |
| Updates | a new version loads on next launch | never forced mid-session, and the in-progress session survives anyway |

## Not in v1

- accounts and sync, or partners logging on their own phones
- plate calculator
- combined group view
- Apple Health (not available to web apps)
- kg
- classic 5/3/1 three-week waves (the scheme model leaves room for them)

## Ideas for later

- **Discomfort penalty.** Covered by ratings in Phase 4: give it 1★.
