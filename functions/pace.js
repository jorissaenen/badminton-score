// When to expect the next change, so watches ask the server at the right moments and stay calm
// otherwise: every request wakes the watch's Bluetooth link, its largest use of battery.
//
// pointMs: how long a point takes in this match, from its own rhythm, the same players' earlier
// matches at the event, or what is usual for the sport. The watch starts from it and learns from
// every point it sees. pollIn: when a watch showing the list of matches should ask again.
import * as M from './engine/match.js';

// Typical time from one point to the next (the rally and the pause after it), per sport.
export const USUAL_POINT_MS = {
  badminton: 18_000, tabletennis: 12_000, squash: 18_000, padel: 25_000, tennis: 30_000, pickleball: 20_000, beachvolleyball: 25_000,
};
const MIN_MS = 6_000;
const MAX_MS = 60_000;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rallies = (state) => state.games.reduce((n, g) => n + g.rallies.length, 0);
const names = (m) => new Set([...m.home, ...m.away].map((p) => p.id ?? p.name));

// The time per point of a match, from its start to now (or to its end); null with too few points.
function ownPace(m, now, least) {
  const n = rallies(m.state);
  const from = m.startedAt?.toMillis?.();
  const to = m.finishedAt?.toMillis?.() ?? now;
  return n >= least && from ? (to - from) / n : null;
}

// history: other matches of the same event (finished ones count).
export function pointMs(m, history = [], now = Date.now()) {
  const usual = USUAL_POINT_MS[m.rules?.sport] ?? USUAL_POINT_MS.badminton;
  const mine = names(m);
  const past = history
    .filter((h) => h.status === 'finished' && [...names(h)].some((p) => mine.has(p)))
    .map((h) => ownPace(h, now, 10)).filter((v) => v !== null);
  const before = past.length ? past.reduce((a, b) => a + b, 0) / past.length : usual;
  const own = ownPace(m, now, 6);
  // This match's own rhythm weighs more as it goes on.
  const value = own === null ? before : own * 0.7 + before * 0.3;
  return Math.round(clamp(value, MIN_MS, MAX_MS));
}

// Seconds until a watch showing the list should ask again. Soon when a court is about to come free
// (a match at match point, or won), calmer while matches are being played, and very calm when no
// event is on. events: today's events of the account's clubs, as { startsAt, endsAt } in ms.
export function pollIn(matches, events, now = Date.now()) {
  const ending = matches.some((m) => M.matchWinner(m.state, m.rules) !== null || M.pointCall(m.state, m.rules) === 'match');
  if (ending) return 6;
  if (matches.length) return 20;
  if (events.some((e) => e.startsAt <= now + 60_000 && now < e.endsAt)) return 10; // on now: a match may start any moment
  const next = events.map((e) => e.startsAt).filter((t) => t > now).sort((a, b) => a - b)[0];
  if (next) return clamp(Math.round((next - now) / 1000) - 60, 15, 300);
  return 600;
}

// When an event ends, from its start and its "HH:MM" start and end times.
export function endsAt(event) {
  const minutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
  let length = minutes(event.end) - minutes(event.start);
  if (!(length > 0)) length += 24 * 60;
  return event.startsAt.toMillis() + length * 60_000;
}
