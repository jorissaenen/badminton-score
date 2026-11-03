---
name: skoor-ui-check
description: Check a Skoor screen visually before calling it done - screenshots on phone (portrait and landscape), TV screen and round watch, judged against the owner's house design rules. Use after any visible change to alpha/, the TV screen, or the watch apps.
---

# Looking at the result

## Take the screenshots

Set up with `skoor-test-env`. Then, with Playwright (`isMobile: true, hasTouch: true` for phones):

| Surface | Viewport |
|---|---|
| Phone portrait | 390 × 844 |
| Phone landscape | 844 × 390 |
| Small phone | 360 × 640 (when a layout is tight) |
| TV screen (`/alpha/link/`) | 1280 × 720, and 1920 × 1080 for big type |
| Garmin round | the compile check only (`skoor-watch-builds`); judge layout from the code's proportions |
| Wear OS round | `./gradlew testDebugUnitTest` draws every screen into `wearos/app/build/screens/` |

Put several shots side by side in one image (PIL) to compare in one look; crop watch shots round.
**Open and look at every screenshot** before saying anything about the UI. Check each state the
change touches (empty, one item, many, long names, offline, error, the disabled button with its
reason).

## House rules (from the owner's feedback)

- Colours: green = action / on / serving; white = selected; red = delete; orange = refused or
  late ("Not counted", "No update for n min"); grey card = paused/offline. Never green for
  "leading".
- **Buttons are never hidden; disabled with a short reason** underneath.
- **No grey cards over the score on the phone**: game won, match won and the interval are
  full screens. Status cards (Not counted, Scoring paused) are the exception.
- TV screens can't be tapped: nothing on a TV may need a tap. Same-size cards per court, a live
  dot, the top bar = Skoor logo left, title centre, LIVE right.
- Names must fit: shorten to first names ("Joris & Maarten"), then cut with "…"; never overflow
  a round watch screen.
- Plain words, short texts (see `skoor-i18n`). Display type: Barlow Condensed, capitals for
  titles and scores; flip tiles for scores.
- Watches: everything inside the round area; UP/top = team on top; the crown never scores.

## Report

Say which surfaces and states were looked at, and what wasn't (e.g. "not on a real Fenix").
Send the owner the combined screenshot when the change is visual.
