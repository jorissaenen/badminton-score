// Statistics of an event's matches, per player: played, won, lost, and points (in tennis and padel:
// games) for and against. Pure, so it can be tested.
import * as M from './match.js';

// A player's key: their id, or for a guest their name.
export const playerKey = (p) => p.id ?? `guest:${p.name}`;

export function eventStats(matches) {
  const rows = new Map();
  const row = (p) => {
    const k = playerKey(p);
    if (!rows.has(k)) rows.set(k, { key: k, id: p.id ?? null, name: p.name, played: 0, won: 0, lost: 0, for: 0, against: 0 });
    return rows.get(k);
  };
  for (const m of matches) {
    if (m.status !== 'finished' || !m.state?.games) continue;
    const winner = M.matchWinner(m.state, m.rules);
    if (winner === null) continue;
    const scores = M.gameScores(m.state, m.rules);
    const totals = [0, 1].map((side) => scores.reduce((n, s) => n + s[side], 0));
    [m.home, m.away].forEach((players, side) => players.forEach((p) => {
      const r = row(p);
      r.played += 1;
      if (winner === side) r.won += 1;
      else r.lost += 1;
      r.for += totals[side];
      r.against += totals[1 - side];
    }));
  }
  return [...rows.values()].sort((a, b) => b.won - a.won || (b.won / b.played) - (a.won / a.played)
    || (b.for - b.against) - (a.for - a.against) || a.name.localeCompare(b.name));
}

// When each player last finished a match (ms), for "waiting longest first".
export function lastPlayed(matches) {
  const last = {};
  for (const m of matches) {
    const at = m.status === 'finished' ? (m.finishedAt?.toMillis?.() ?? Date.now()) : Infinity; // playing now: Infinity
    for (const p of [...m.home, ...m.away]) {
      const k = playerKey(p);
      if (m.status === 'stopped') continue;
      last[k] = Math.max(last[k] ?? 0, at);
    }
  }
  return last;
}
