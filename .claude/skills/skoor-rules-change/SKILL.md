---
name: skoor-rules-change
description: Change Skoor's Firestore security rules or the watch server (functions/watch.js) safely - rules and their emulator tests together, the red-team check, and how they deploy. Use for any edit to firestore.rules, firestore.indexes.json, functions/ or tests/rules/.
---

# Changing the rules or the watch server

## Always together

- A rule change comes with a test in `tests/rules/*.test.js` that **fails without the change and
  passes with it**: one `assertSucceeds` for what must work and one `assertFails` for what must not
  (another member, a non-member, an anonymous screen, a wrong type or a too-long string).
- A new field a client writes needs: type and size checks in the rules (create **and** update),
  the field in the app code, and a test.
- Server code (`functions/watch.js`, `pace.js`) is tested in `tests/rules/watch.test.js` (via
  `handle()`) and pure logic in `tests/*.test.js`.

## Checks

1. Before writing: read the rules for that collection and the app code that writes it.
2. After writing, red-team it (skill `firebase-security-rules-auditor` checklist): update bypass,
   who decides the authority (never a field the user writes), sizes and types, can a member act
   for another, can an anonymous screen write anything except its own key/lastSeen.
3. `npm run test:rules` (stop running emulators first, by PID). Report the counts.
4. **Never** validate with `firebase deploy --dry-run` or any Firebase CLI call against the real
   project; the emulator tests are the check.

## Deploy

Rules, indexes and functions deploy only through GitHub Actions on push to `main`
(`.github/workflows/firebase.yml`, runs the tests first). Tell the owner the change goes live when
that run is green. Indexes can take minutes to build after the deploy.

## Things that bit before

- Display (TV) docs: every update must keep `linkedBy == request.auth.uid` and `validLink`.
- Match scoring: `version` +1 per change, the 5-second freeze after a point, undo always allowed.
- `functions/engine/` must stay identical to `alpha/js` (`npm run engine`).
