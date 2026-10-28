# Badminton Score

An offline-capable PWA scoreboard for badminton, operated with a cheap Bluetooth camera
shutter remote (the "AB Shutter3" kind) so you can keep score without walking to the phone.

## Remote controls

| Remote              | Action                                   |
|---------------------|------------------------------------------|
| 1 click             | Point for the home team                  |
| 2 clicks            | Point for the away team                  |
| Long press (≥0.8 s) | Remove the last point                    |
| Long press after a game ends | Start the next game (or a new match once the match is won) |

While a game is over, clicks are ignored, so a stray press can't start the next game.
You can also tap a team's half of the screen to give it a point, and use the bar buttons
for undo, swapping sides, fullscreen and settings. The fullscreen button only shows in a
browser tab that supports it; the installed app already opens fullscreen.

## Features

- BWF rally scoring: 21 points, win by 2, capped at 30 (15- and 11-point formats too)
- Best of 1, 3 or 5 games; the game winner serves first in the next game
- *New match* pop-up (⚙ → New match, or after a match is won): a mini court shows both teams where
  they'll be on screen. Tap ⇄ to swap sides, type team names if you like, and tap a team to serve
  first, or tap *Random*. The remote works there too: 1 click switches the server, 2 clicks draws
  at random, a long press starts the match. *Random* uses the browser's cryptographically secure
  generator (`crypto.getRandomValues`, Web Crypto API; see `js/random.js`): one random bit, so
  each team has exactly a 50 % chance and the outcome can't be predicted or steered.
- Shuttle icon marks the serving team; the score call puts the server's score first, as umpires do
- Optional spoken score calls ("11 9", "Game, Home") and beeps confirming each remote gesture,
  so you know the press registered without looking. The app picks the best English voice on the
  device (choose another and test it under ⚙ → Voice), speaks after the beep instead of over it,
  and keeps the audio output awake so the first syllable isn't lost.

  For the best sound, install a high-quality voice on the device: on iPhone/iPad, Settings →
  Accessibility → Spoken Content → Voices → English → an *Enhanced* or *Premium* voice; on Android,
  Settings → Text-to-speech output → Speech Services by Google → install English voice data.
- Umpire-style "game point" / "match point" calls, right after the server's score
  ("20 game point 6", "29 match point all"), also shown on screen
- Optional *Intervals & breaks* (off by default) with the official timing: a 60-second interval
  when the leader reaches 11 (with "change ends" in the deciding game) and a 2-minute break
  between games. A countdown shows on screen, "20 seconds" is called 20 seconds before the end
  (as umpires do, twice), and a beep plus the score call ("11 6, play") marks the end. A long press or the next point
  ends an interval early.
- *Change ends automatically* (on by default): after each game, and at 11 in the deciding game,
  the scores swap sides on screen so each team's score stays on its own side of the court. A
  "Change ends" banner and call announce it. The ⇄ button still lines the screen up with the court.
- Settings show the app version and what was detected about the device, for troubleshooting
- Keeps the screen awake, saves the match across reloads, works offline once loaded
- Opened in a browser tab, it immediately offers to install itself. Where the browser allows it
  (Chrome, Edge, Samsung Internet, Vivaldi on Android and desktop) that's a one-tap *Install*
  button. Otherwise (always on iPhone/iPad) the visitor picks their browser and gets numbered
  steps for exactly that browser, with a picture of each button to tap. *Not now* hides it until
  the next visit; it's also under ⚙ → *Install as app*. Never shown inside the installed app.
- Optional *screen sleep* (off by default): the screen goes black after 30 s without activity and
  lights up for 30 s on every remote press or score change. A web app can't truly switch the
  display off (and a locked phone stops passing remote presses to it), so the screen stays on
  but fully black; on OLED screens black pixels are off, so it saves battery like real sleep.
  On LCD screens the backlight stays on.

## Getting your remote to work

**No camera remote at hand?** Turn on ⚙ → Remote control → *Use the screen as remote*: a tap
anywhere on the scores then acts like the remote button (1 tap home, 2 taps away, hold to undo),
with a finger or a mouse. On a computer or Android, a Bluetooth mouse's wheel and thumb buttons
also act as the remote. On iPhone they don't: iOS turns every mouse click into a plain tap
(AssistiveTouch) and keeps the extra buttons for itself. A Bluetooth keyboard works everywhere:
every key acts as the remote. Tap the tester box in settings to see what the device sends.

**Earbuds as the remote:** turn on ⚙ → Remote control → *Headphone controls*. Earbud media
commands then act as the remote: play/pause = home point, next track = away point, previous track
= undo (set which tap sends which command in the earbuds' own app). The app plays an inaudible
audio loop so the phone sends those commands to it, and shows the score in the Now Playing panel.
Volume buttons (including "remote shutter" buttons on earbud cases, which press Volume Up) can't
be used: iOS never passes volume keys to a web page.

A smartwatch's music controls (Apple Watch Now Playing, Wear OS media controls, Garmin music
controls) send the same commands, so with *Headphone controls* on, the watch works as the remote
too. Some watches (seen with a Garmin) send one press several times; the same command arriving
again within 1.5 s counts as one press. The tester in settings lists the last few commands
received, with the time between them, including repeats it ignored.

A camera remote pairs as a Bluetooth keyboard and sends a key press (usually *Volume Up*,
sometimes *Enter*). The app accepts any key, but the browser must receive it:

1. Pair the remote in your phone's Bluetooth settings.
2. Open the app, tap ⚙ → *Remote timing & tester* and press the remote. If a key shows up,
   you're set.
3. If long presses are read as clicks (or the other way round), adjust *Long press* and
   *Double-click gap* in the same section.

Platform notes: iOS/iPadOS doesn't pass volume keys to web pages, so on iPhone the remote
only works if it sends a regular key such as Enter. Many remotes have a separate "Android"
button that sends Enter — try both buttons in the tester. Some remotes send nothing while the
button is held; on those, long press can't be detected and you'll need the on-screen ↶ button.

## Alpha, beta and production

| Edition | Address | Files | Version | Firebase data |
|---|---|---|---|---|
| Production | `…/badminton-score/` | site root | v28, frozen (also branch `release/v28`) | real (later) |
| Beta | `…/badminton-score/beta/` | `beta/` | v29, for test friends | real (`badminton-prod`, later) |
| Alpha | `…/badminton-score/alpha/` | `alpha/` | v30, in development | mock (`badminton-dev`) |

New features are built in `alpha/`, then copied to `beta/` for test friends, and finally over the
site root for everyone. Each edition keeps its own data, offline cache and install ("Badminton
Score α" / "β", with the letter on the icon and in the bottom bar). On first start an edition
copies production's settings, without ever writing to production's data. `npm test` tests the
alpha's code.

Firebase: see [docs/firebase-setup.md](docs/firebase-setup.md).

## Plans

The next big step (Firebase, sign-in, seasons, live screens, statistics, watch apps) is described
in [docs/architecture.md](docs/architecture.md), with the task list in
[docs/roadmap.md](docs/roadmap.md). Production is frozen at v28 (branch `release/v28`).

## Running / hosting

It's plain static files with no build step. A PWA needs HTTPS (or `localhost`):

- **GitHub Pages:** repository Settings → Pages → deploy from branch `main`, folder `/`.
  Then open the Pages URL on your phone and choose *Add to Home Screen* / *Install app*.
- **Locally:** `npm start` (serves on http://localhost:8080).

When you change any app file, bump `VERSION` in `sw.js`. The service worker is network-first,
so installed copies pick up changes on the next launch while online.

If an installed app still shows an old icon: Android caches it with the home-screen shortcut.
Uninstall the app, clear the site's data (Chrome → Settings → Site settings → All sites →
the site → Delete data), then install again. On iOS/iPadOS remove the app, delete the site's data
under Settings → Apps → Safari → Advanced → Website Data, and add it to the home screen again.

## Icons

Vector icons from open-source sets, used under their licenses:

- Shuttlecock (app icon, serve marker): [Hugeicons](https://github.com/hugeicons/hugeicons-react) (free set), MIT
- Settings, undo, swap, fullscreen, pencil, dice: [Lucide](https://lucide.dev), ISC
- Remote control: [Tabler Icons](https://tabler.io/icons), MIT

The PNG app icons in `icons/` are rendered from `icons/shuttlecock.svg`.

## Tests

```
npm test
```

Unit tests cover the scoring rules (`js/match.js`) and the click/double-click/long-press
recognizer (`js/gesture.js`).
