# Wigwam531

5/3/1 training log for a garage gym. It's a PWA installed on an iPhone home
screen, and it logs a whole group's workouts on one phone. It starts from
nSuns 4-day, but every part of the program can be edited.

The design is in `docs/PLAN.md`. The build order and each phase's spec are in
`docs/PHASES.md`. Read the spec for the phase you're working on before
writing code.

**Status:**
- Phase 0 is done and was verified on the phone.
- Phase 1 (engine) is done. The user compared a printed week with their real TMs against the nSuns app and it matched.
- Phase 2 (profiles, library, backup) is done. A backup was saved and restored on the phone.
- Phase 3 (workout flow) is done. A real garage session went well.
- Follow-ups from that session are built and pushed: day labels, foldable exercises, the workout rating, and the week-end backup prompt.
- Phase 4 (accessory suggestions) is built and has had real use. A "focus" (extra accessory sets for chosen muscles) was added after it.
- Phase 5 (program editor and custom programs) is built and was clicked through in the phone-size preview. It's waiting on the user restructuring something real and training a week on it.
- Phase 5b (feedback from the garage) is built and was clicked through in the phone-size preview. On the phone, the user still needs to check that the tab bar stays put after a workout resumes, and that the set editor fits.
- Phase 6 (progress and metrics) is built and was checked in the phone-size preview against six months of demo data. It's waiting on the user looking at their real data on the phone, plus the trimmed space under the tab bar.
- Phase 7 (skipping sets, accessory groups, deload and TM-test suggestions, workout and weekly numbers, comparing on exercise pages) is built and was checked in the preview. It's waiting on real use. Phase 8 (5/3/1 waves with BBB and BBS) is next to plan; partners on their own phones is planned in `docs/SYNC.md`.
- **Demo data:** in the dev build only, Progress has "Load demo data" (`src/db/demo.ts`), six months of made-up training for a Demo profile. It's imported only behind `import.meta.env.DEV`, so it never ships.

## Hard rules

**Plans are calculated, logs are stored.** Never save a day's prescribed
sets ahead of time. Work them out from program + TMs + week type every time
they're shown. A logged set stores both the prescribed and the actual
numbers, so program edits never rewrite history. This is the core of the
app, because the nSuns app's need to "start a new week before a change
applies" is the main thing it fixes.

**`src/engine/` is pure.** No React, no Dexie, no `window`, no `Date.now()`
inside logic; pass the time in. That's what lets the engine be tested in
Node. If the engine needs data, the caller passes it in.

**`src/db/` is the only code that touches IndexedDB.**

**Never lose a logged set.** Write every set to IndexedDB the moment it's
logged. Nothing about an in-progress workout lives only in React state. A
reload, a crash or an update mid-workout must resume exactly where it was.

**Schema changes add; they never rename or repurpose.**
- Dexie versions only add tables or indexes. Never edit a version that has shipped; add a new one.
- Exercise IDs are permanent once shipped, because logged sets reference them. Change the display name, never the ID.
- Exports carry a schema version. Importing an older export must keep working.

**Never force an update.** `registerType: 'prompt'` is deliberate. An update
must not reload the page under someone mid-set.

**Pushing deploys.** Every push to `main` goes live at
https://slowney.github.io/Wigwam531/, and the repo is public. The user's
standing rule is to push when a phase's tests pass, and to say what went up.
Never commit anyone's bodyweight or export files. Ask before committing real
lifting numbers as fixtures; use made-up ones otherwise.

## Verification

- `npm test` runs Vitest: engine tests, plus db tests on `fake-indexeddb`.
- `npm run build` typechecks with `tsc` and builds.
- Run both after every change. A new rule isn't done until a test covers it.
- The desktop app's browser pane can run the dev server at phone size: `wigwam-dev` in `.claude/launch.json`, URL `http://localhost:5173/Wigwam531/`.
  - If `preview_start` can't find that config (a session that began in another folder), run Vite in the background and open the URL with `preview_start`'s `url` instead.
  - The pane has no share sheet. "Save a backup" falls back to a download there, so test restore by handing the file input a `File` through `DataTransfer`.
- You can't test on the iPhone. That covers installing, launching offline, screen wake lock, sound, and the share sheet. When a change needs the phone, say so explicitly; don't claim it works.
- The planning engine has been checked against the user's nSuns app, set by set. `tests/fixtures/nsuns-4day-week.txt` is now its correctness check, so treat a fixture mismatch as an engine bug, not a fixture to regenerate.

## Conventions

- **TypeScript:** strict, with `noUncheckedIndexedAccess`. React function components. Dexie `useLiveQuery` for reactive reads; no state library.
- **Imports:** relative imports carry their `.ts`/`.tsx` extension, and type-only imports use `import type`. Node runs the engine directly by stripping types (`npm run week`), and `verbatimModuleSyntax` / `erasableSyntaxOnly` keep it that way. So no enums or namespaces.
- **`npm run week -- bench=225 squat=275 ohp=135 deadlift=315`** prints a planned week. Add `row=135` for the heavy-row preset, and `deload` or `tmTest` for those week types. It renders the same way as `tests/fixtures/nsuns-4day-week.txt`.
- **Weights:** pounds, stored as numbers. Round prescribed weights with the engine's rounding helper, never inline.
- **Comments:** explain *why*, not *what*.
- **Dependencies:** none added without asking. Versions are pinned exactly (`npm install --save-exact`).
- **Toolchain:** newer than you may expect: TypeScript 7 (native `tsc`), Vite 8, React 19.3, React Router 8, Vitest 5, vite-plugin-pwa 2. Check the typings in `node_modules` before assuming an API.
- **Node:** installed in `C:\Program Files\nodejs`. A shell started before it was installed needs it added to PATH.
- **Routing:** hash routing, because GitHub Pages has no fallback route for single-page apps.
- **UI:** dark theme, touch targets of 48px or more, safe-area insets respected, nothing that only works on hover.
- **Layout:** the page itself never scrolls. `.app` is pinned to the viewport and `.scroller` scrolls inside it, with the tab bar as an ordinary flex child. iOS misplaces `position: fixed` bars after the keyboard closes or the app resumes, so don't pin new bars to the screen; overlays (sheets, toasts) are the exception.

## iPhone PWA gotchas

- **Separate storage.** Home-screen apps don't share storage with Safari, and deleting the icon deletes the data. That's why backups matter.
- **Rest timer limits.** There are no background timers, no local notifications, and no `navigator.vibrate`. The rest timer can only alert while the app is open, so keep the screen awake with the Wake Lock API.
- **No sound, by the user's choice.** The rest timer is visual only. Don't add audio.
- **Icons.** iOS ignores SVG home-screen icons, so `scripts/make-icons.mjs` draws PNGs. Run `npm run icons` after changing it.
- **Base path.** The app is served from `/Wigwam531/`, which is why asset URLs in `index.html` are relative.

## Domain notes

- **TMs.** A TM is 90% of a 1RM. nSuns T2 lifts take their percentages from a *different* lift's TM: incline uses bench, sumo uses deadlift, front squat uses squat. A slot's TM source handles this.
- **Progression** comes from the 95% 1+ set, never the last AMRAP set.
- **Weeks.** Each profile has its own week, and days aren't tied to the calendar. A skipped lift keeps its TM.
- **Followers.** Partners follow the leader's program with their own TMs, and can override individual slots.
- **Custom exercises** live in IndexedDB. `setCustomExercises` keeps a copy where `findExercise` sees it: `App` refreshes it on every change, and `addCustomExercise` does too. So use `findExercise` and `allExercises()`, never `EXERCISES` alone, anywhere a user's own exercise could turn up.
- **Charts** are hand-drawn SVG (`src/ui/charts/`), no chart library. Series colours are `--chart-1` and `--chart-2`, validated for colour-blind separation on `--surface`; text stays in text colours.
- **Custom schemes** work the same way: `setCustomSchemes`, `findScheme` and `allSchemes()`, never `SCHEMES` alone.
- **Program edits** go through `editProgram` (it applies the change to the stored program inside a transaction, so quick taps can't undo each other) or `overrideSlot` for followers. Both check today's workout: nothing may remove a day someone is partway through, or drop or change a lift they've logged sets on.
- **The garage** has one pair each of 45/35/25/15/10/5/2.5 plates, so 320 lb is the most a 45 lb barbell can hold.
