// What watches (Garmin now, others later) talk to. A watch can't sign in with Google, so it links
// once to an account, like a screen: it shows a QR code and a key, someone signed in confirms it
// in the app (watchLinks/{key}), and the watch then gets its own long key for that account. With
// it, the watch lists the matches being played in the account's clubs, follows one and scores it,
// under the same rules as the app: a change is the next version of the score (a press on an older
// score doesn't count), and after a point the score is frozen for FREEZE_MS (undo is not).
//
// Requests and answers are JSON; the key goes in "Authorization: Bearer <key>". handle() takes a
// plain request ({ method, path, query, body, headers }) so it can be tested without HTTP.
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as M from './engine/match.js';
import qrcode from './engine/qrcode.js';
import { pointMs, pollIn, endsAt } from './pace.js';

export const FREEZE_MS = 5000;
const LINK_MS = 10 * 60_000; // how long a watch's linking key is valid
const KEY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
// Where the QR code leads: the app's page that confirms the link (?watch=KEY).
const LINK_URL = process.env.WATCH_LINK_URL || 'https://jorissaenen.github.io/badminton-score/alpha/';

const hash = (s) => createHash('sha256').update(s).digest('hex');
const ok = (json) => ({ status: 200, json });
const fail = (status, error, extra = {}) => ({ status, json: { error, ...extra } });

function newKey() {
  return [...randomBytes(6)].map((b) => KEY_CHARS[b % KEY_CHARS.length]).join('');
}

// The QR code as rows of 0 and 1, which the watch draws as squares.
export function qrRows(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (qr.isDark(r, c) ? '1' : '0')).join(''));
}

// ---------- linking ----------

async function startLink(db, body, now) {
  let key = newKey();
  for (let i = 0; i < 5 && (await db.doc(`watchLinks/${key}`).get()).exists; i += 1) key = newKey();
  const secret = randomBytes(24).toString('hex');
  const model = String(body?.model ?? 'Garmin').slice(0, 60);
  await db.doc(`watchLinks/${key}`).set({
    secretHash: hash(secret), model, uid: null, createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + LINK_MS),
  });
  const url = `${LINK_URL}?watch=${key}`;
  return ok({ key, secret, expiresIn: LINK_MS / 1000, url, qr: qrRows(url) });
}

async function pollLink(db, body, now) {
  const key = String(body?.key ?? '');
  const ref = db.doc(`watchLinks/${key}`);
  const d = await ref.get();
  if (!d.exists || d.data().expiresAt.toMillis() < now) return fail(410, 'expired');
  const link = d.data();
  if (hash(String(body?.secret ?? '')) !== link.secretHash) return fail(403, 'wrong secret');
  if (!link.uid) return ok({ status: 'waiting' });
  // Confirmed: the watch's own key for this account. Only its hash is kept.
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const watchId = tokenHash.slice(0, 20);
  const batch = db.batch();
  batch.set(db.doc(`watchTokens/${tokenHash}`), { uid: link.uid, watchId, createdAt: Timestamp.fromMillis(now) });
  batch.set(db.doc(`users/${link.uid}/watches/${watchId}`), { model: link.model, linkedAt: Timestamp.fromMillis(now), lastUsedAt: Timestamp.fromMillis(now) });
  batch.delete(ref);
  await batch.commit();
  return ok({ status: 'linked', token, name: link.userName ?? '' });
}

// The account behind a watch's key, or null (unknown, or unlinked in the app).
async function account(db, headers, now) {
  const token = String(headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const t = await db.doc(`watchTokens/${hash(token)}`).get();
  if (!t.exists) return null;
  const { uid, watchId } = t.data();
  const watch = db.doc(`users/${uid}/watches/${watchId}`);
  const w = await watch.get();
  if (!w.exists) { await t.ref.delete(); return null; } // unlinked in the app
  if (now - (w.data().lastUsedAt?.toMillis() ?? 0) > 3600_000) watch.update({ lastUsedAt: Timestamp.fromMillis(now) }).catch(() => {});
  const user = await db.doc(`users/${uid}`).get();
  return { uid, name: user.data()?.name ?? '' };
}

// ---------- matches ----------

const side = (players) => players.map((p) => p.name).join(' & ');

// What a watch shows of a match: the score as on the flip tiles, who serves, the earlier games,
// how long the score is still frozen, the side the watch's owner plays on (mine: 0, 1 or null),
// whether the teams stand on the other ends (ends) and whether it's the interval (at 11).
export function summary(id, clubId, m, now, uid = null) {
  const { rules, state } = m;
  const d = M.display(state, rules);
  const over = M.isGameOver(state, rules);
  const mine = uid ? [m.home, m.away].findIndex((players) => players.some((p) => p.id === uid)) : -1;
  const frozen = m.lastPointAt ? Math.max(0, m.lastPointAt.toMillis() + FREEZE_MS - now) : 0;
  return {
    club: clubId, match: id, version: m.version ?? 0, status: m.status, court: m.court ?? null,
    sport: rules.sport, bestOf: rules.bestOf,
    home: side(m.home), away: side(m.away),
    tiles: d.tiles, games: d.games ?? null,
    server: over ? -1 : M.server(M.currentGame(state), rules, state),
    won: M.gamesWon(state, rules),
    past: M.gameScores(state, rules).slice(0, -1),
    gameNo: state.games.length, gameOver: over,
    gameWinner: over ? M.currentWinner(state, rules) : null,
    matchWinner: M.matchWinner(state, rules),
    frozenMs: frozen, lastBy: m.lastByName ?? '', lastAction: m.lastAction ?? '',
    mine: mine === -1 ? null : mine,
    ends: M.endsChanged(state, rules), interval: M.intervalNow(state, rules),
  };
}

async function isMember(db, clubId, uid) {
  return (await db.doc(`clubs/${clubId}/members/${uid}`).get()).exists;
}

// Today's date where the club is ("2026-10-29").
const today = (timeZone, now) => new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'Europe/Brussels' }).format(new Date(now));

// The matches being played now in the account's clubs, by court, and when to ask again (pollIn,
// in seconds: see pace.js).
async function listMatches(db, me, now) {
  const clubs = await db.collection(`users/${me.uid}/clubs`).get();
  const out = [];
  const raw = [];
  const events = [];
  for (const c of clubs.docs) {
    if (!(await isMember(db, c.id, me.uid))) continue;
    const [live, club] = await Promise.all([
      db.collection(`clubs/${c.id}/matches`).where('status', '==', 'live').get(),
      db.doc(`clubs/${c.id}`).get(),
    ]);
    for (const d of live.docs) {
      raw.push(d.data());
      out.push({ ...summary(d.id, c.id, d.data(), now, me.uid), clubName: c.data().name ?? '' });
    }
    const todays = await db.collection(`clubs/${c.id}/events`).where('date', '==', today(club.data()?.timeZone, now)).get();
    for (const e of todays.docs) {
      if (e.data().status !== 'cancelled' && e.data().startsAt) events.push({ startsAt: e.data().startsAt.toMillis(), endsAt: endsAt(e.data()) });
    }
  }
  out.sort((a, b) => (a.court ?? 99) - (b.court ?? 99));
  return ok({ matches: out.slice(0, 20), pollIn: pollIn(raw, events, now) });
}

async function getMatch(db, me, query, now) {
  const { club, match } = query;
  if (!club || !match || !(await isMember(db, club, me.uid))) return fail(404, 'not found');
  const d = await db.doc(`clubs/${club}/matches/${match}`).get();
  if (!d.exists) return fail(404, 'not found');
  // pace=1 (when the watch opens the match): the same players' earlier matches of the event too.
  const m = d.data();
  const history = query.pace ? (await db.collection(`clubs/${club}/matches`).where('eventId', '==', m.eventId).get()).docs.map((x) => x.data()) : [];
  return ok({ ...summary(d.id, club, m, now, me.uid), pointMs: pointMs(m, history, now) });
}

// One press: 'point0', 'point1', 'undo' or 'next' (the next game), on version `basedOn`. Answers
// { counted: true, ...score } or { counted: false, reason, by, ...score } with the score that stands.
async function press(db, me, body, now) {
  const { club, match, action } = body ?? {};
  const basedOn = Number(body?.basedOn);
  if (!['point0', 'point1', 'undo', 'next'].includes(action)) return fail(400, 'unknown action');
  if (!club || !match || !(await isMember(db, club, me.uid))) return fail(404, 'not found');
  const ref = db.doc(`clubs/${club}/matches/${match}`);
  return db.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists) return fail(404, 'not found');
    const m = d.data();
    const { rules, state } = m;
    const refuse = (reason) => ok({ counted: false, reason, by: m.lastBy !== me.uid ? m.lastByName ?? '' : '', ...summary(d.id, club, m, now, me.uid) });
    // A finished match takes one thing: undoing its last point, which reopens it (as on the phone).
    if (m.status !== 'live' && !(m.status === 'finished' && action === 'undo')) return refuse('over');
    if ((m.version ?? 0) !== basedOn) return refuse('stale');
    const point = action.startsWith('point');
    if (point && m.lastPointAt && now < m.lastPointAt.toMillis() + FREEZE_MS) return refuse('frozen');
    let next;
    if (point) {
      if (M.isGameOver(state, rules)) return refuse('gameover');
      next = M.addPoint(state, Number(action.slice(-1)), rules);
    } else if (action === 'undo') {
      if (state.games.length === 1 && M.currentGame(state).rallies.length === 0) return refuse('nothing');
      next = M.undo(state);
    } else {
      if (!M.isGameOver(state, rules) || M.matchWinner(state, rules) !== null) return refuse('notover');
      next = M.nextGame(state, rules);
    }
    const winner = M.isGameOver(next, rules) ? M.matchWinner(next, rules) : null;
    const changes = {
      state: next, version: (m.version ?? 0) + 1, lastAction: action, lastBy: me.uid, lastByName: me.name.slice(0, 60),
      lastPointAt: point ? Timestamp.fromMillis(now) : null, updatedAt: FieldValue.serverTimestamp(),
      status: winner !== null ? 'finished' : 'live', winner,
      ...(winner !== null && { finishedAt: FieldValue.serverTimestamp() }),
    };
    tx.update(ref, changes);
    return ok({ counted: true, ...summary(d.id, club, { ...m, ...changes }, now, me.uid) });
  });
}

// ---------- the requests ----------

export async function handle(db, req, now = Date.now()) {
  const path = req.path.replace(/\/+$/, '').replace(/^\/watch/, '') || '/';
  const route = `${req.method} ${path}`;
  if (route === 'POST /link/start') return startLink(db, req.body, now);
  if (route === 'POST /link/poll') return pollLink(db, req.body, now);
  const me = await account(db, req.headers, now);
  if (!me) return fail(401, 'not linked');
  if (route === 'GET /me') return ok({ name: me.name });
  if (route === 'GET /matches') return listMatches(db, me, now);
  if (route === 'GET /match') return getMatch(db, me, req.query ?? {}, now);
  if (route === 'POST /press') return press(db, me, req.body, now);
  return fail(404, 'unknown');
}
