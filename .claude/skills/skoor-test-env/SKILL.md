---
name: skoor-test-env
description: Start and use Skoor's local test setup - Firebase emulators, the web server, test sign-in, seeding clubs/events/matches, and Playwright browser checks of the app, the TV screen and the watch API. Use before any browser test or end-to-end check of alpha/.
---

# Skoor test environment

Everything runs locally against the Firebase emulators (project `demo-badminton`); nothing
touches the real project.

## Start (each fresh container, and again after the container idled)

Background processes die when the container idles; check before use, start what's down.

```bash
cd /home/user/badminton-score
curl -s -o /dev/null -w "emu %{http_code}\n" http://127.0.0.1:8085/      # 200 = running
curl -s -o /dev/null -w "web %{http_code}\n" http://localhost:8771/alpha/ # 200 = running
# Start detached with setsid (a plain & dies with the shell):
(setsid nohup npx firebase emulators:start --only auth,firestore --project demo-badminton > <scratchpad>/emu.log 2>&1 &)
(setsid nohup python3 -m http.server 8771 > /dev/null 2>&1 &)
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8085/ && break; sleep 1.5; done
```

Ports: Firestore 8085, Auth 9099, web 8771 (serves the repo root: the app is `/alpha/`, the TV
screen `/alpha/link/`).

**Stopping:** kill by PID (`for p in $(pgrep java); do kill $p; done`). Never `pkill -f` with a
pattern that also appears in your own command line: it kills your own shell (exit 144).
`npm run test:rules` starts its **own** emulator on 8085: stop the running one first.

## The app in emulator mode

Open any page with `?emulator` (kept in sessionStorage): `http://localhost:8771/alpha/?emulator#/clubs`.
In that mode `globalThis.testSignIn(uid, name)` exists, **but only after Firebase has loaded**:
load `#/clubs` first (Play doesn't load Firebase for someone who never signed in), then:

```js
await page.waitForFunction(() => typeof globalThis.testSignIn === 'function');
await page.evaluate(() => testSignIn('joris1', 'Joris Saenen'));
```

**The account id is not `joris1`**: the emulator gives a random uid. Read it before seeding:

```js
const UID = await page.evaluate(async () => (await import('./js/session.js')).session.user.uid);
```

Useful page setup: `sessionStorage.setItem('badminton-score-alpha-install-dismissed', '1')` (no
install sheet), `speechSynthesis.speak = () => {}` (silence), app state in
`localStorage['badminton-score-alpha-v1']`.

## Seeding data

Either through the app's own functions inside the page (they obey the rules, good for
realistic flows):

```js
const Club = await import('./js/club.js'); const S = await import('./js/session.js');
const clubId = await Club.createClub(S.session.user, 'BC Test', 'badminton', defaults);
await Club.addEvents(S.session.user, clubId, { type: 'training', date, start: '20:00', end: '22:00', courts: 2, reminder: null });
const matchId = await Club.addMatch(S.session.user, clubId, { eventId, sport: 'badminton', rules, home, away, state, court: 1 });
```

or directly with firebase-admin from Node (bypasses rules; needed for old timestamps or
states the app can't create):

```js
import { createRequire } from 'node:module';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
const req = createRequire('/home/user/badminton-score/functions/package.json');
const { initializeApp } = req('firebase-admin/app'); const { getFirestore, Timestamp } = req('firebase-admin/firestore');
initializeApp({ projectId: 'demo-badminton' }); const db = getFirestore();
```

Data shapes: events need `type, date, start, end, startsAt (Timestamp), status, courts`; a club
member needs `clubs/{c}/members/{uid}` with a `role` and `users/{uid}/clubs/{c}` for "my clubs";
matches: see `Club.addMatch` (version, lastPointAt, startedAt, updatedAt).

## The TV screen

Open `/alpha/link/?emulator`, read the key from `.key-code`, link it from a signed-in page with
`Club.linkScreen(user, await Club.screenForKey(key), key, { clubId, eventId, mode: 'court', court: 1, announce, beep, notices, flip })`.

## The watch API without a watch

`functions/watch.js` exports `handle(db, { method, path, query, body, headers }, now)`: call it
from Node with the admin `db` above (`POST /link/start`, `/link/poll`, `GET /matches`,
`/match`, `POST /press` with `Authorization: Bearer <token>`).

## Playwright

`require('playwright')` works anywhere (Chromium is pre-installed; never `playwright install`).
Put scripts and screenshots in the session scratchpad, not in the repo. Log page errors
(`page.on('pageerror', …)`). Write long output to a file and print only the tail. Look at
every screenshot you make before claiming the UI is right.
