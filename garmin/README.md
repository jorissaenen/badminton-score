# Skoor for Garmin

A Connect IQ watch app: keep the score of a club match from your wrist, together with whoever
else keeps it on a phone or another watch.

## How it works

- **Linking, once.** The first time, the watch shows a QR code and a key (like `K7M2QX`). Scan it
  with your phone, or open the app → You → Watches → *Link a watch* and type the key, and confirm.
  The watch then has its own key for your account. Unlink it there any time.
- **No phone app needed for scoring.** The watch talks to Skoor itself (the Cloud Function
  `watch`, see `functions/watch.js`), through Garmin Connect on the phone's Bluetooth or the
  watch's Wi-Fi/LTE. Garmin Connect only passes the requests on.
- **Matches.** The list shows the matches being played now in your clubs, by court.
- **Scoring.** UP: point for the top team · DOWN: point for the bottom team · BACK: undo ·
  START: the menu, or the next game when a game is over. Touch scoring (tap the top or bottom
  half) can be switched on in the menu; it's off by default because sleeves and sweat tap too.
- **Several keepers.** The first press on a score counts; a press on a score that has just
  changed doesn't, and gets an orange *Not counted* card with who was first, and a different
  buzz. After a point the score is frozen for 5 seconds (undo still works).
- **Live or not.** The watch asks for the score every 2.5 seconds. With an answer in the last 8
  seconds it shows LIVE in green; otherwise OFFLINE in orange and a grey *Scoring paused* card,
  and presses don't count until it's live again.

## Build it yourself

1. Install the **Connect IQ SDK Manager** from developer.garmin.com/connect-iq/sdk, sign in with
   your own Garmin account, download the latest SDK and **your watch** under Devices.
2. Make a developer key once (the command is printed by `./build.sh` when it's missing).
3. Build for your watch, with its id from `manifest.xml` (for example `fr265`, `fenix7`,
   `venu3`):

   ```
   ./build.sh fr265          # → build/skoor-fr265.prg
   ./build.sh fr265 run      # also opens it in the simulator
   ```
4. **On the watch:** connect it by USB, copy `build/skoor-fr265.prg` to `GARMIN/APPS/`, unplug.
   Skoor is then in the list of apps. (Later: through the Connect IQ Store.)

**Fenix 6X** (Pro, Sapphire, Solar): its id is `fenix6xpro`, so `./build.sh fenix6xpro`. It has no
touch screen, so you score with the buttons only: UP (left, middle) and DOWN (left, bottom) for
the points, BACK (right, bottom) undoes, START (right, top) for the menu; holding UP opens the
menu too. Its screen shows 64 colours, so Skoor uses brighter greys there to keep the cards
visible.

Is your watch missing from `manifest.xml`? Add `<iq:product id="…"/>` with its id from the SDK
Manager. The app needs API level 3.2 (most watches since 2019).

## The code

| File | What |
|---|---|
| `source/SkoorApp.mc` | Starts with linking or the list of matches |
| `source/Api.mc` | Requests to Skoor, the watch's key, the settings |
| `source/LinkView.mc` | The QR code and key, waits for the confirmation |
| `source/MatchesView.mc` | The matches being played now |
| `source/ScoreView.mc` | Scoring: flip tiles, LIVE/OFFLINE, frozen bar, cards, the buttons |
| `source/Menus.mc` | The menus (undo, touch scoring, other match, unlink) |
| `source/Look.mc` | Colours, buzzes and the cards, as in the watch designs |

The server it talks to is set in `Api.mc` (`BASE`): the alpha's Firebase project for now.
