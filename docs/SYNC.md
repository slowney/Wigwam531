# Partners on their own phones: sync plan

**Status:** a draft to go over together. Nothing here is scheduled yet. The
"Decisions" section at the end lists what has to be settled before any of
it is built.

Today every workout for the whole group is logged on one iPhone, and the
data lives only in that phone's storage (plus manual backups). This plan
adds an account for the garage group and a server that keeps everyone's
phones in step, without giving up what makes the app work in the garage:
it runs with no signal, and it never loses a logged set.

## What it should do

- **Each person can log on their own phone,** and one phone can still log
  the whole group, as now. Both can happen in the same week.
- **A leader's program edits reach followers' phones.** So do saved
  programs, custom exercises and set schemes.
- **Offline first.** Everything is written to the phone first, exactly as
  now, and synced whenever there's a connection. The garage having no
  signal changes nothing about logging.
- **Never lose a logged set,** on any phone, whatever order the phones
  sync in.
- **A safe copy off the phone.** iOS can clear a home-screen app's storage,
  and deleting the icon deletes everything. The server becomes the copy
  that survives that, so manual backups become a nice-to-have.

## How it would look

1. **Solo on your own phone:** sign in once, pick which profile is you, and
   log as now. Your data is also on the server.
2. **The group on one phone (today):** unchanged. Whoever's phone it is
   logs everyone, and it all syncs later.
3. **Everyone on their own phone:** each phone runs its own workout for its
   own person. Rotation and the shared tab bar don't apply across phones;
   each person sees their own sets and rest. Accessory picks shared with
   followers work only for people logged on the same phone, until a later
   step adds a live group view.
4. **Mixed:** two people on one phone, a third on their own. It works,
   because sets are tied to a person, not to a phone.

## Constraints

- **Hosting:** GitHub Pages only serves static files, so the server is a
  separate service. The app stays on Pages.
- **The repo is public.** The app can only carry public keys. The server
  must enforce who can see what (a group's data is visible only to its
  members).
- **No push notifications needed.** Syncing on open, on finishing a
  workout and every few minutes while open is enough.
- **Cost:** a garage of three should fit a free or near-free tier. Pricing
  has to be checked at decision time, not taken from this document.
- **Health data:** bodyweights and training history would sit on a third
  party's server. Members should know that, and be able to export and
  delete their data.

## Options for the server

| Option | What it is | For | Against |
|---|---|---|---|
| **A. Dexie Cloud** | A sync service built for Dexie, the database library the app already uses | Least rewriting: the same tables and live queries, with sync and sign-in added | A paid service, and a vendor tie. Its id, permission and conflict rules need checking against this app's before committing |
| **B. Supabase** (Postgres, sign-in, row-level security) with a sync layer written for this app | Local Dexie stays the source of truth; a queue of changes goes up, newer rows come down | Full control of conflict rules; generous free tier; plain SQL to inspect | More code to write and test: the sync layer is the hard part |
| **C. A small custom server** (for example Cloudflare Workers with a SQLite database) | Everything written for this app | Most control, cheapest at this size | Most work, and sign-in and security become our job |
| **D. CRDT libraries** (Automerge, Yjs) | Merge-anything documents | Conflicts are handled for us | Overkill for mostly append-only data, and a big change to how data is stored |

**Recommendation:** prototype with **A** for a week of real use, since it's
the smallest change. If its rules don't fit (ids, permissions, conflicts),
fall back to **B**. Either way, the groundwork below is the same.

## Groundwork the app needs whichever option wins

**Rows that are only ever added** merge cleanly: two phones' sets simply
combine. These are logged sets, TM history, bodyweights and ratings
history. Ids are already random UUIDs, so two phones never clash.

**Rows that change** need a conflict rule:

| Data | Rule |
|---|---|
| Profile settings, targets, focuses, restrictions | Newest change per field wins |
| A program | Merged per day and per lift, not as one document, so two edits to different days both survive. Program edits are already small steps applied to the stored program (`editProgram`), so they can travel as steps |
| Followers' changes to lifts | Per lift, newest wins |
| A week's day statuses | Per day. *Done* (a set was logged) beats *to do*; otherwise newest wins |
| Workouts and their entries | Each entry belongs to one phone while it's in progress, so there's no conflict until it's finished; after that, newest wins |
| Saved programs, schemes, custom exercises | Newest wins per item |

**Deletes become tombstones.** Deleting a workout, a saved program, a
scheme, a custom exercise or a bodyweight marks it deleted instead of
removing it, so the deletion reaches other phones. The app hides tombstones
everywhere.

**Every changing row gets an updated time and the phone that changed it.**
The clock comes from the app's own counter, not the phone's clock alone, so
a phone set to the wrong time can't win every conflict.

**Week ids become predictable** (profile + week number). Then two phones
that both run Start Week for the same person end up with the same week
instead of two.

**Schema:** this is a new Dexie version that only adds fields and indexes,
and a new export version; old exports keep importing. That fits the
"schema changes add" rule.

## Accounts and the group

- **A group** is the garage: one owner, and members invited with a link or
  code. Profiles belong to the group.
- **Sign-in** is by email one-time code: no passwords to forget.
- **"Who am I"** is picked once per phone and becomes the default
  participant. Anyone can still log for anyone in the group, as now (see
  Decisions).
- **Joining with data already on the phone:** the first phone uploads its
  data to start the group. A phone joining later starts empty and downloads
  the group's data. Merging two phones' existing histories is risky (the
  same person could exist twice), so that would be a one-time, by-hand
  merge of profiles (see Decisions).

## Phases

1. **Groundwork, no server:** tombstones, updated times, predictable week
   ids, the new schema and export version. The merge rules go in the
   engine as pure functions, with tests showing that two copies of the data
   changed in different orders end up identical. This is shippable on its
   own and changes nothing visible.
2. **Server and sign-in, one phone:** create a group and sync the one
   phone up and down. In practice it's an automatic cloud backup, and it
   fixes iOS clearing storage.
3. **More phones:** join a group, choose "who am I", sync in both
   directions, apply the conflict rules, and show a "changed on another
   phone" note when a program edit merged.
4. **Live group view (optional):** while online, see the others' progress
   in the same workout, and share accessory picks across phones.

## Testing

- **Merge rules** are tested in Node: random sequences of edits on two
  simulated phones, synced in every order, must end identical, and must
  never drop a logged set.
- **The sync layer** is tested against a fake server.
- **On the phones:** log in the garage with no signal, then sync at home;
  edit the same program on two phones offline; delete a workout on one
  phone while the other is offline.

## Decisions for later

1. **Server:** Dexie Cloud, Supabase or a custom server, after a prototype
   and a price check.
2. **Permissions:** can anyone in the group log and edit for anyone (as
   now), or only for themselves plus whoever they're training with?
3. **Phones that already have data:** start fresh on join, or a by-hand
   merge of profiles?
4. **Workouts across phones:** is each phone's own workout enough, or is a
   live shared workout (rotation, shared accessory picks) needed from the
   start?
5. **Cost ceiling:** what's acceptable per month?
6. **Backups:** keep the manual file backups once the server holds a copy,
   or demote them to an occasional export?
