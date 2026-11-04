# Skoor (badminton-score)

Skoor (skoor.it, slogan "Play it. Skoor it.") keeps the score of racket-sport matches and runs
club evenings: events, attendance, fair rotation, live screens at the venue, statistics, and watch
apps. The owner is a Belgian club player; replies to him go in plain English, without jargon.

## Layout

| Path | What | Rule |
|---|---|---|
| `/` (index.html, js/, css/, sw.js, manifest) | **Production v28**, live for users | **Never change** |
| `beta/` | v29 beta edition | Don't change unless asked |
| `alpha/` | The app being built: vanilla ES-module PWA, no framework, no build step | Main work happens here |
| `alpha/link/` + `alpha/js/display.js` | Screens at the venue (TV) | |
| `functions/` | Cloud Functions v2 (europe-west1): reminders, `watch.js` API, `pace.js`; `functions/engine/` = copies of `alpha/js/match.js`, `sports.js`, `timed.js`, `vendor/qrcode.js` (`npm run engine`; a test checks they are identical) | |
| `firestore.rules`, `firestore.indexes.json` | Database rules | Change together with `tests/rules/` |
| `garmin/` | Connect IQ watch app (Monkey C) | skill `skoor-watch-builds` |
| `wearos/` | Wear OS app (Kotlin, Compose) | skill `skoor-watch-builds` |
| `docs/` | architecture, decisions (D-numbers), roadmap, market-analysis, firebase-setup | Update when a decision or feature changes |
| `brand/` | Slogans and brand notes | |

Firebase projects: `badminton-dev-bc258` (alpha), the emulators use `demo-badminton`. Deploys of
rules and functions run only through GitHub Actions (`.github/workflows/firebase.yml`) on push to
`main`; never log in to Firebase or deploy from a session, and never run the Firebase CLI against
a real project.

## Standing rules from the owner

- Work on `main`, commit and push when a piece of work is done and tested. **No pull requests**
  unless asked.
- Commit messages end with the attribution lines the session gives (Co-Authored-By and
  Claude-Session). No model names anywhere in the repo (code, comments, docs, commits).
- Never ask for or accept passwords, service-account keys, payment details or other secrets.
  Never use his Garmin, Google or other accounts.
- **Plain words** in the app and in replies: no technical terms where a normal word works.
- **Buttons are never hidden: disable them and say why** (e.g. "The event ended at 21:30…").
- Colours: green = action / on / serving; white = selected; red = delete. Never green for
  "leading". Orange = refused or late, grey card = paused/offline.
- On the phone no grey cards over the score (game won etc. are full screens).
- Every text in the app exists in English **and** Dutch (`alpha/js/lang/en.js`, `nl.js`).
- Every change to app files bumps `VERSION` in `alpha/sw.js`; new files go in its `ASSETS`.

## Checks before saying something works

- `npm test` (unit tests) and `npm run test:rules` (rules + watch server, starts its own
  emulator; stop a running one first). Report the pass counts.
- UI changes: look at screenshots (phone portrait and landscape, TV, round watch), see
  `skoor-ui-check`. Say plainly what wasn't tested (e.g. "not on a real watch").

## Skills for this project

| Skill | For |
|---|---|
| `skoor-test-env` | Emulators, web server, test sign-in, seeding data, Playwright |
| `skoor-release` | The finish: version bump, tests, commit, push |
| `skoor-i18n` | Adding or changing texts (en + nl) |
| `skoor-rules-change` | Changing `firestore.rules` or the watch server |
| `skoor-ui-check` | Screenshots and the house design rules |
| `skoor-watch-builds` | Building and checking the Garmin and Wear OS apps |
| `design-board` | The design sprint board (the owner comments there) |
| `lean-work` | Doing the work with fewer tokens, without losing quality |
| `market-research` | Market, pricing and competitor research |

Vendored third-party skills and their review: `.claude/skills/README.md`. Firebase skills apply
with the deploy rule above: validate rules with the emulator tests, not with `firebase deploy`.
