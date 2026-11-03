---
name: skoor-release
description: Finish a piece of Skoor work - bump the alpha service-worker version, check offline files, run the unit and rules tests, commit with the attribution lines, and push to main. Use whenever work on alpha/, functions/, rules, garmin/ or wearos/ is done.
---

# Finishing and shipping a change

Run through this in order; stop and fix at the first failure.

1. **Production untouched.** `git status --short` must show no changes in the root app
   (`index.html`, `js/`, `css/`, `sw.js`, `manifest.webmanifest`, `icons/`) nor in `beta/`.
2. **Version bump** (any change under `alpha/`): raise the number in
   `const VERSION = 'v30-alpha.NN'` in `alpha/sw.js` by one.
3. **New files offline:** every new file under `alpha/` that the app loads is listed in
   `ASSETS` in `alpha/sw.js` (paths relative to `alpha/`).
4. **Engine copies:** changed `alpha/js/match.js`, `sports.js` or `vendor/qrcode.js`? Run
   `npm run engine` (the copies in `functions/engine/` must be identical; a test checks it).
5. **Texts:** new or changed texts are in both `lang/en.js` and `lang/nl.js` (`skoor-i18n`).
6. **Tests:**
   - `npm test`: always.
   - `npm run test:rules`: when `firestore.rules`, `functions/` or `tests/rules/` changed, or the
     app's database calls. It starts its own emulator: stop a running one first (by PID, see
     `skoor-test-env`). Write its output to a file and show only the summary lines.
   - Watch apps: the builds in `skoor-watch-builds`.
   Note the pass counts for the final message.
7. **Docs:** a decision or feature that changed? Update `docs/` (decisions D-numbers, roadmap,
   architecture) in the same commit.
8. **Commit** with `git add` of the changed paths (not blindly `-A`; never commit secrets, local
   SDK paths such as `local.properties`, or build output), a message saying what changed for
   the user and why, ending with the attribution lines the session gives.
9. **Push:** `git push -u origin main`. On a network failure retry up to 4 times (2, 4, 8, 16 s).
10. **Report** in plain words: what changed for the user, what was tested (with counts) and what
    wasn't (e.g. "not on a real watch"), and anything the owner has to do (pull and rebuild,
    wait for the GitHub Actions deploy, a setting in Firebase).
