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
  (as umpires do), and a beep plus the score call ("11 6, play") marks the end. Scoring the next
  point ends an interval early.
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
- Settings, undo, swap, fullscreen: [Lucide](https://lucide.dev), ISC

The PNG app icons in `icons/` are rendered from `icons/shuttlecock.svg`.

## Tests

```
npm test
```

Unit tests cover the scoring rules (`js/match.js`) and the click/double-click/long-press
recognizer (`js/gesture.js`).
