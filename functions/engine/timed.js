// Timed games (basketball, football): a clock per period instead of a number of points. Pure
// logic, no DOM, so it can be unit-tested; the watch server uses a copy (functions/engine).
//
// State: { log: [...] }, everything that happened, in order, with the time (ms) it happened:
//   { k: 'start', at }            the clock starts (or starts again)
//   { k: 'pause', at }            the clock stops; points still count while it's stopped
//   { k: 'pt', team, n, at }      `n` points for team 0 (home) or 1 (away)
//   { k: 'next', at }             the next period starts (the clock waits for 'start')
//   { k: 'end', at }              the game is over
// The score, the clock and the periods are derived from the log, so every point, pause and start
// is kept for a replay, and undo takes away the last point.
//
// Rules: { sport, periods, minutes } (see timedRules).

export const TIMED = [
  {
    id: 'basketball',
    values: [1, 2, 3], // free throw, basket, three-pointer
    usual: 2, // counted by itself when nothing else is chosen
    lengths: [{ periods: 4, minutes: 10 }, { periods: 2, minutes: 20 }, { periods: 4, minutes: 12 }],
  },
  {
    id: 'football',
    values: [1],
    usual: 1,
    lengths: [{ periods: 2, minutes: 45 }, { periods: 2, minutes: 30 }, { periods: 2, minutes: 20 }],
  },
];

export const timedOf = (id) => TIMED.find((s) => s.id === id) ?? null;
export const isTimed = (id) => timedOf(id) !== null;

// The rules of a timed game: one of the sport's lengths (the first when it isn't one of them).
export function timedRules(sport, periods, minutes) {
  const s = timedOf(sport) ?? TIMED[0];
  const l = s.lengths.find((x) => x.periods === Number(periods) && x.minutes === Number(minutes)) ?? s.lengths[0];
  return { sport: s.id, periods: l.periods, minutes: l.minutes };
}

export const newTimed = () => ({ log: [] });

// Everything shown about a timed game at time `now` (ms).
export function timedView(state, rules, now) {
  const lengthMs = rules.minutes * 60_000;
  const byPeriod = [[0, 0]];
  let since = null; // when the clock last started, while it runs
  let elapsed = 0; // in the current period, up to the last stop
  let finished = false;
  for (const e of state.log) {
    if (e.k === 'start') since = e.at;
    else if (e.k === 'pause' && since !== null) { elapsed += e.at - since; since = null; }
    else if (e.k === 'pt') byPeriod[byPeriod.length - 1][e.team] += e.n;
    else if (e.k === 'next') { byPeriod.push([0, 0]); elapsed = 0; since = null; }
    else if (e.k === 'end') { if (since !== null) elapsed += e.at - since; since = null; finished = true; }
  }
  const elapsedMs = Math.min(lengthMs, elapsed + (since !== null ? Math.max(0, now - since) : 0));
  const periodOver = elapsedMs >= lengthMs;
  const score = byPeriod.reduce((t, p) => [t[0] + p[0], t[1] + p[1]], [0, 0]);
  return {
    period: byPeriod.length, periods: rules.periods, lengthMs, elapsedMs, leftMs: lengthMs - elapsedMs,
    running: since !== null && !periodOver && !finished, periodOver, finished, score, byPeriod,
    winner: finished && score[0] !== score[1] ? (score[0] > score[1] ? 0 : 1) : null,
  };
}

// One action on a timed game: 'start', 'pause', 'point0' / 'point1' (with `n` points; the sport's
// usual when n isn't one of its values), 'undo' (the last point of this period) or 'next' (the next
// period, or the end after the last). Answers { state } or { refused: reason }.
export function timedPress(state, rules, action, now, n) {
  const v = timedView(state, rules, now);
  const sport = timedOf(rules.sport) ?? TIMED[0];
  const add = (e) => ({ state: { log: [...state.log, { ...e, at: now }] } });
  if (v.finished && action !== 'undo') return { refused: 'over' };
  if (action === 'start') {
    if (v.running) return { refused: 'nothing' };
    if (v.periodOver) return { refused: 'periodover' };
    return add({ k: 'start' });
  }
  if (action === 'pause') {
    if (!v.running) return { refused: 'nothing' };
    return add({ k: 'pause' });
  }
  if (action === 'point0' || action === 'point1') {
    const pts = sport.values.includes(Number(n)) ? Number(n) : sport.usual;
    return add({ k: 'pt', team: Number(action.slice(-1)), n: pts });
  }
  if (action === 'undo') {
    // The last point, if it was scored in this period (an ended game opens again).
    let i = state.log.length - 1;
    while (i >= 0 && state.log[i].k !== 'pt' && state.log[i].k !== 'next') i -= 1;
    if (i < 0 || state.log[i].k !== 'pt') return { refused: 'nothing' };
    return { state: { log: state.log.filter((e, j) => j !== i && e.k !== 'end') } };
  }
  if (action === 'next') {
    // When the period's time is up, or earlier when the clock has been stopped (the referee ends it).
    if (v.running) return { refused: 'running' };
    if (v.elapsedMs === 0 && !v.periodOver) return { refused: 'notstarted' };
    if (v.period >= v.periods) return add({ k: 'end' });
    // Close the period's clock first, so the time played stays exact.
    const log = closeClock(state.log, rules);
    return { state: { log: [...log, { k: 'next', at: now }] } };
  }
  return { refused: 'unknown' };
}

// A clock that ran out while still "started": a pause at the moment it reached the period's length.
function closeClock(log, rules) {
  let since = null;
  let elapsed = 0;
  for (const e of log) {
    if (e.k === 'start') since = e.at;
    else if (e.k === 'pause' && since !== null) { elapsed += e.at - since; since = null; }
    else if (e.k === 'next') { elapsed = 0; since = null; }
  }
  if (since === null) return log;
  return [...log, { k: 'pause', at: since + (rules.minutes * 60_000 - elapsed) }];
}
