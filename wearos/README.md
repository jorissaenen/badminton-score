# Skoor for Wear OS

A watch app to keep the score of a club match from your wrist, together with whoever else keeps it
on a phone or another watch. Same server, same linking and the same screens as the Garmin app
(`garmin/`); Wear OS 3 or later (Galaxy Watch 4 and later, Pixel Watch, recent TicWatch…).

## How it works

- **Linking, once.** The first time, the watch shows a QR code and a key (like `K7M 2QX`). Scan it
  with your phone, or open the app → You → Watches → *Link a watch* and type the key, and confirm.
  The watch then has its own key for your account. Unlink it there any time.
- **No phone app needed.** The watch talks to Skoor itself (`functions/watch.js`), through the
  phone's Bluetooth, Wi-Fi or LTE.
- **Matches.** The list shows the matches being played now in your clubs, by court.
- **Scoring.**
  - Touch (on by default): tap the top half for the team on top, the bottom half for the other.
  - Buttons, on watches with extra buttons: top button for the team on top, bottom button for the
    other, hold either to undo. With one extra button: press for the team on top, twice quickly for
    the other, hold to undo.
  - The crown or bezel only scrolls lists and the menu: while scoring it does nothing, so a brushed
    crown never changes the score. Swiping back is off while scoring; the back gesture or a long
    press opens the menu.
  - Your own team on top when you play in the match (menu: *My team on top*).
- **Several keepers.** The first press on a score counts; a press on a score that has just changed
  gets an orange *Not counted* card with who was first. After a point the score is frozen for 5
  seconds (undo still works).
- **Interval and change ends.** A green card and a buzz (menu: *Interval alerts*).
- **Battery.** The watch asks for the score when a change is likely (it learns how long a point
  takes in this match), calmly in breaks, and not at all when the app isn't on screen. The screen
  stays on while scoring (menu: *Screen on*).
- **Leaving.** Menu → *Other match* or *Close Skoor*; the match goes on for the others.

## Build and install it yourself

You need Android Studio (or the Android SDK) and a watch in developer mode.

1. **Build:** open the `wearos` folder in Android Studio, or on the command line:
   ```
   ./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
   ```
2. **On the watch:** Settings → System → About → tap *Software version* (or *Build number*) 7
   times. Then Settings → Developer options → *ADB debugging* and *Wireless debugging* on.
3. **Pair and install** (watch and computer on the same Wi-Fi). Wireless debugging → *Pair new
   device* shows a pairing code and address:
   ```
   adb pair 192.168.1.23:37000      # the pairing address and code from the watch
   adb connect 192.168.1.23:41000   # the address on the Wireless debugging screen
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```
   Skoor is then in the watch's app list. (Later: through the Play Store.)

## The code

| File | What |
|---|---|
| `MainActivity.kt` | The screens and the way between them, the buttons, the screen kept on |
| `Api.kt` | Requests to Skoor, the watch's key and its settings |
| `Session.kt` | One match being scored: checks, presses, the cards |
| `Pace.kt` | When to ask for the score again (as the Garmin app) |
| `Summary.kt`, `Words.kt` | The match as the server sends it; the texts |
| `LinkScreen.kt`, `MatchesScreen.kt`, `ScoreScreen.kt`, `MenuScreen.kt` | The screens |
| `Look.kt`, `Haptics.kt` | Colours, type, flip tiles, cards; the buzzes |

Tests: `./gradlew testDebugUnitTest` runs the logic tests and draws every screen on a round watch
into `app/build/screens/` (Robolectric, no watch needed).

The server it talks to is set in `Api.kt` (`BASE`): the alpha's Firebase project for now.

The type, Barlow Condensed ExtraBold (`res/font`), is Copyright 2017 The Barlow Project Authors
(https://github.com/jpt/barlow), under the SIL Open Font License 1.1: the same type as the app, the
screens and the logo.
