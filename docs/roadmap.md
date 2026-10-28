# Roadmap

Production stays on **v28** (branch `release/v28`) until a phase has been tested in the beta.
See [architecture.md](architecture.md) for the design. **You** marks things only the repository
owner can do (accounts, settings, payments).

Rough sizes: S = a few hours, M = a day or two, L = several days.

## Phase 0 — Production and beta side by side

Result: `…/badminton-score/` stays v28; `…/badminton-score/beta/` shows the newest version.

- [x] Freeze v28 in branch `release/v28`
- [ ] Create branch `develop` for new work (S)
- [ ] GitHub Actions workflow: build `main` to the site root and `develop` to `/beta/`, run the
      tests, publish both (M)
- [ ] **You:** repository Settings → Pages → Source: *GitHub Actions*
- [ ] Separate beta from production: storage keys, cache names, service worker scope, manifest id
      and name, "β" badge on icon and screen (M)
- [ ] Fix production's service worker so it only deletes its own caches, then release as v29 (S)
- [ ] Release checklist in the README: test in beta → merge `develop` into `main` → `release/vNN` (S)

## Phase 1 — Foundation: build step, Firebase, sign-in

Result: you can sign in to the beta with Google or an e-mail link.

- [ ] **You:** create two Firebase projects, `badminton-prod` and `badminton-dev` (region
      `europe-west1`), on the Blaze plan with a budget alert; send me the web configs
- [ ] Move the app to a Vite build, keeping the scoring code unchanged; tests in CI (M)
- [ ] Firebase Authentication: Google and e-mail link (no Apple sign-in) (M)
- [ ] Firestore with offline persistence; Firebase Emulator Suite for local tests (S)
- [ ] Security rules skeleton with automated rule tests (M)
- [ ] Account screen: name, photo, sign out, delete account (S)

## Phase 2 — Seasons, members, roles, invitations

Result: you create a season, invite the group by WhatsApp or QR code, and give admin rights.

- [ ] Create, edit, archive a season; defaults (points, format) (M)
- [ ] Roles owner / admin / score keeper / member, enforced by security rules (M)
- [ ] Invite link and QR code with role and expiry; join flow after sign-in (M)
- [ ] Player list with guests (no account); claim a guest player after signing in (M)
- [ ] Member management: change roles, remove members (S)

## Phase 3 — Sessions, courts and live scoring

Result: two phones score two courts; any screen follows them live.

- [ ] Create a session: courts, format (1v1 / 2v2 / mixed); change the number of courts during the
      session (M)
- [ ] Attendance: check-in, late arrivals, leaving early (S)
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
- [ ] Session overview for players: live courts, queue, estimated waiting time (M)

## Phase 4 — Matchmaking

Result: the next match for a free court is proposed automatically, fair and balanced.

- [ ] Matchmaking module (plain JS, unit-tested): rotation by waiting, balance by rating, variety
      by partner/opponent history, secure random choice among the best options (M)
- [ ] Organiser screen: proposal per free court; accept, re-draw, or adjust by tap or drag (M)
- [ ] Waiting-time estimate from tonight's measured match durations (S)

## Phase 5 — Statistics and leaderboard

Result: player pages with progress charts, session summary, season leaderboard.

- [ ] Cloud Function on match finish: update summaries and ratings (M)
- [ ] Rating with OpenSkill (doubles with rotating partners) (M)
- [ ] Player page: totals, win %, rating chart, records (M)
- [ ] Pairs and head-to-head (M)
- [ ] Session summary: winner of the evening, longest/closest match (S)
- [ ] Season leaderboard (rating and win %, minimum number of matches) and records (M)
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

1. May display screens follow a session without signing in (read-only link)?
2. Leaderboard on rating, win %, or both?
3. Garmin or Wear OS first (whichever more players have)?
