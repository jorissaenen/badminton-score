# Roadmap

Production stays on **v28** (branch `release/v28`) until a phase has been tested in the beta.
See [architecture.md](architecture.md) for the design and [decisions.md](decisions.md) for the
fixed choices and open questions. **You** marks things only the repository
owner can do (accounts, settings, payments).

Rough sizes: S = a few hours, M = a day or two, L = several days.

## Phase 0 — Alpha, beta and production side by side

Result: `…/badminton-score/` stays v28; `/beta/` is for test friends; `/alpha/` is where new
features are built, on mock data.

- [x] Freeze v28 in branch `release/v28`
- [x] Copy the app to `beta/` (v29) and `alpha/` (v30); production files in the site root are not
      touched
- [x] Separate the editions: storage keys, cache names, service worker scope, manifest id and name,
      α/β badge on icon and screen; first start copies production's settings (read-only)
- [x] Unit tests run against `alpha/`
- [x] Firebase setup guide for you: [firebase-setup.md](firebase-setup.md)
- [x] **You:** Firebase project `badminton-dev` with web app (`badminton-dev-bc258`) — for alpha
- [ ] Release checklist in the README: alpha → beta → production (S)

## Phase 1 — Foundation: build step, Firebase, sign-in

Result: you can sign in to the alpha with Google or an e-mail link.

- [x] **You:** in `badminton-dev`, turn on sign-in and create the database (steps 3 and 4 of
      [firebase-setup.md](firebase-setup.md))
- [x] Security rules published automatically by GitHub Actions after every change
- [ ] **You:** create `badminton-prod` the same way (for beta and production) and send me its
      `firebaseConfig`
- [ ] Decide when the build step arrives: commit the built beta into `beta/` from a GitHub Actions
      workflow, or switch Pages to "GitHub Actions" as its source (S)
- [ ] Move the app to a Vite build, keeping the scoring code unchanged; tests in CI (M)
- [x] Firebase Authentication in alpha: Google (pop-up, redirect if pop-ups are blocked) and
      e-mail link; Account section in settings; Firebase loaded only when needed, cached offline
- [x] First database use: own profile in `users/{uid}`; rules in `firestore.rules`
- [ ] Verify sign-in on real phones (Safari tab, installed iPhone app, Android) (S)
- [x] Firestore with offline persistence; Firebase Emulator Suite for local tests (`npm run
      emulators`; the alpha on localhost with `?emulator` uses it, with a fake sign-in)
- [x] Security rules with automated rule tests (`npm run test:rules`)
- [ ] Mock data generator for alpha: a club and season with players, events, registrations, matches, keepers and
      corrections; "reset demo data" in alpha only (M)
- [ ] Data compatibility between beta and production: `schemaVersion` on documents, additive
      changes, one-off migrations at release (S)
- [x] Account screen: name, photo (initials without one), online status, sign out
- [ ] Delete account (S)

## Phase 2 — Clubs, seasons, members, roles, invitations

Result: you create a club, add seasons, invite the group by WhatsApp or QR code, and give admin
rights.

- [x] Create, rename and delete a club; one person in several clubs, each with its own role
- [x] Seasons inside a club: name and period (suggested September–June), add, edit, delete;
      "current" season by date
- [x] Roles owner / admin / score keeper / member per club, enforced by security rules
- [x] Invite link and QR code with role and expiry (1, 7 or 30 days), shared by WhatsApp, the
      share sheet or copying; withdrawing a link; join flow, also when signing in first
- [x] Player list with players without an account, kept across seasons; "That's me" links one to
      your account after joining
- [x] Member management: change roles, remove members, leave a club
- [ ] Club defaults (points, match length) editable (S)

## Phase 2b — Events, registration and reminders

Result: the training evenings are planned ahead; everyone says whether they're coming and gets a
reminder.

- [x] One-off events: type, date, time window, location, number of courts
- [x] Weekly events ("every Tuesday 20:00–21:30" until the end of the season); cancel or delete
      one date, or this and all later dates, without touching the rest
- [x] Answer in advance: going / not going with an optional reason; admins answer for anyone,
      including players without an account; going / not going / no answer, visible to all
- [ ] Optional registration deadline (S)
- [x] The next event in settings, with your own answer; upcoming events in the Club window
- [ ] "Add to calendar" (.ics subscription per member) (S)
- [x] **You:** Blaze plan (firebase-setup.md, step 5), Web Push key (step 7), GitHub secret for
      deploying (step 8)
- [x] Reminders by web push at a smart moment (evening event: the same morning; morning event:
      the evening before), or 1–3 days before, another day and time, or none; scheduled Cloud
      Function every 15 minutes; not for people who said they're not coming; tapping opens the
      event; on/off per device
- [x] Edit an event (pencil): only this date or all upcoming dates of the series; dates changed on
      their own keep those changes
- [x] GitHub Actions: tests, then deploys rules, indexes and functions to badminton-dev (working)

## Skoor redesign in the alpha

Result: the alpha looks and works like the redesign (name, logo and flip tiles decided in D1): three
tabs (Play, Clubs, You) and full screens instead of the settings window.

- [x] App frame with tabs and screens (plain JavaScript modules, no build step yet; the build step
      with Vite and TypeScript, D14, comes later)
- [x] Play: next event of all your clubs (answer right there), Continue match, Quick match
- [x] New match: tap a side's 00 tiles to choose the first server, draw who serves, names (Home /
      Away when unknown), points and match length; the remote works here too
- [x] Match: flat flip tiles with two digits, players' names, games won, SERVES under the serving
      side's green tiles; landscape without a bottom bar (undo, swap, menu as small round buttons)
- [x] Match menu: score calls, beeps, screen sleep, intervals, changing ends, remote; end or keep
- [x] You: account, reminders, sound and voice, remote with timing and tester, install, version
- [x] Sign in: Google or e-mail link (also pasting the link in the installed iPhone app)
- [x] Clubs, Start a club, Club home, Event (answers with a reason, answering for others), Plan /
      Edit event (weekly, reminder, this date or all upcoming dates), People and roles, Invite
      (QR, WhatsApp, share, open links), Club settings (name, usual place, club match rules,
      seasons, leave, delete), Join with "Which player are you?"
- [ ] Club match and Follow a court on Play (need Phase 3: matches saved with players)
- [ ] Player picker for a match (Fill in for me; here and not playing first, by waiting time;
      playing now with their court; didn't say they'd come; a guest by name) (Phase 3)
- [ ] Head-to-head on New match and when accepting a challenge: the exact line-up for racket and
      pair sports, team against team for team sports (Phase 5)
- [ ] Profiles: tap a name; "You and X" with Singles / Doubles / Partners / Teams; visibility
      Everyone / Members of my clubs / Members of my teams / Nobody (D23) (Phase 5)
- [ ] Live now, match detail, event results, season ranking (Phases 3 and 5)
- [ ] Teams within a club, viewers, challenges between clubs (after Phase 5)

## Phase 3 — Events on the day: courts and live scoring

Result: two phones score two courts; any screen follows them live.

- [ ] Start the event: courts, format (1v1 / 2v2 / mixed); change the number of courts during the
      event (M)
- [ ] Attendance: check-in (pre-filled from registrations), late arrivals, leaving early (S)
- [ ] Match as an event log in Firestore; the scoreboard writes events and shows the computed
      score (L)
- [ ] Every event records the score keeper who entered it, the device and the input (tap, remote,
      earbuds, watch); undo and after-match fixes are events that point to the update they
      correct, never deletions. Which player won a rally is not recorded, only the team (M)
- [ ] "Keeping score" on the scoring phone: shows the current keeper; one tap hands over to another
      member or to a keeper without an account (someone next to the court) (M)
- [ ] Keeper list per match: everyone who entered updates, with first/last update, number of
      updates and corrections (S)
- [ ] Score keeping mode: bind a phone to a court; remote, earbuds and taps work as today (M)
- [ ] One player, one live match (transaction) (S)
- [ ] Display mode: one court full screen, or a grid of all courts; read-only share link without
      sign-in (M)
- [ ] Offline: scoring keeps working without a connection and syncs afterwards (M)
- [ ] Event overview for players: live courts, queue, estimated waiting time (M)

## Phase 4 — Matchmaking and tournaments

Result: the next match for a free court is proposed automatically, fair and balanced.

- [ ] Matchmaking module (plain JS, unit-tested): rotation by waiting, balance by rating, variety
      by partner/opponent history, secure random choice among the best options (M)
- [ ] Organiser screen: proposal per free court; accept, re-draw, or adjust by tap or drag (M)
- [ ] Waiting-time estimate from tonight's measured match durations (S)
- [ ] Tournament types: random tournament (random partners, individual ranking), weighted
      tournament (pairing by rating and current standing, so similar levels meet), knockout
      tournament (groups by rating, then knockout); rounds drawn
      from the registered and checked-in players; final ranking (L)

## Phase 5 — Statistics and leaderboard

Result: player pages with progress charts, event summary, all-time progress, season leaderboard.

- [ ] Cloud Function on match finish: update summaries and ratings (M)
- [ ] Rating with OpenSkill (doubles with rotating partners) (M)
- [ ] Player page: totals, win %, rating chart, records (M)
- [ ] Pairs and head-to-head (M)
- [ ] Event summary: winner of the evening or tournament ranking, longest/closest match (S)
- [ ] Season leaderboard (rating and win %, minimum number of matches) and records (M)
- [ ] All-time view: every season side by side and the rating over all seasons (progress) (M)
- [ ] Score keeper statistics: matches kept, score updates entered, corrections (their updates
      later undone or fixed), error rate = corrections ÷ updates, per input method, time to
      correct, keeping score while playing vs from the side (M)
- [ ] Match history: replay every event of a match, with keeper and corrections (S)

## Phase 6 — Watch apps

Result: scoring from the wrist; the phone or TV only shows the score.

- [ ] Watch API (Cloud Functions): pair with a code, current match, point, undo; idempotent (M)
- [ ] Pairing screen in the PWA for admins (S)
- [ ] Garmin Connect IQ app (L), sideloaded: a `.prg` per watch model plus a download page with
      USB install steps — free
- [ ] Wear OS app (L), sideloaded: APK plus install steps — **You:** free "limited distribution"
      Android developer account (optional: €25 Google Play account for a private test track)
- [ ] Watch events carry the paired keeper and device, like any other event (S)
- No Apple Watch app (it would need the paid Apple Developer Program); Apple Watch owners use
  *Headphone controls*

## Phase 7 — Finishing

- [ ] Privacy page; data export and account deletion (S)
- [ ] Firestore backups (scheduled export) (S)
- [ ] Error reporting from devices (S)
- [ ] Documentation for organisers (S)

## Decisions still open

1. May display screens follow an event without signing in (read-only link)?
2. Leaderboard on rating, win %, or both?
3. Garmin or Wear OS first (whichever more players have)?
