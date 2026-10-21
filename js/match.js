// Pure badminton match logic (BWF rally scoring). No DOM access, so it can be unit-tested.
//
// State shape:
//   { games: [{ firstServer: 0|1, rallies: [0|1, ...] }, ...] }
// Team 0 is the home team, team 1 is the away team.
// Everything else (scores, server, winners) is derived from the rally history,
// which makes "undo" a simple pop.

export const DEFAULT_RULES = { points: 21, cap: 30, bestOf: 3 };

export function capFor(points) {
  // 21 -> 30, 15 -> 20 (3-game 15-point variant), 11 -> 15; always win-by-2 until the cap.
  return { 21: 30, 15: 20, 11: 15 }[points] ?? points + 9;
}

export function newMatch(firstServer = 0) {
  return { games: [{ firstServer, rallies: [] }] };
}

export function gameScore(game) {
  const s = [0, 0];
  for (const w of game.rallies) s[w]++;
  return s;
}

export function gameWinner(game, rules) {
  const [a, b] = gameScore(game);
  const cap = rules.cap ?? capFor(rules.points);
  for (const [me, other, team] of [[a, b, 0], [b, a, 1]]) {
    if (me >= cap) return team;
    if (me >= rules.points && me - other >= 2) return team;
  }
  return null;
}

export function currentGame(state) {
  return state.games[state.games.length - 1];
}

export function gamesWon(state, rules) {
  const won = [0, 0];
  for (const g of state.games) {
    const w = gameWinner(g, rules);
    if (w !== null) won[w]++;
  }
  return won;
}

export function matchWinner(state, rules) {
  const need = Math.ceil(rules.bestOf / 2);
  const won = gamesWon(state, rules);
  if (won[0] >= need) return 0;
  if (won[1] >= need) return 1;
  return null;
}

export function server(game) {
  const r = game.rallies;
  return r.length ? r[r.length - 1] : game.firstServer;
}

// Serving court for the current server: even score -> right, odd -> left.
export function serviceCourt(game) {
  const s = gameScore(game)[server(game)];
  return s % 2 === 0 ? 'right' : 'left';
}

export function isGameOver(state, rules) {
  return gameWinner(currentGame(state), rules) !== null;
}

export function addPoint(state, team, rules) {
  if (isGameOver(state, rules)) return state;
  const games = state.games.slice(0, -1);
  const g = currentGame(state);
  return { games: [...games, { ...g, rallies: [...g.rallies, team] }] };
}

export function undo(state) {
  const games = state.games.map((g) => ({ ...g, rallies: [...g.rallies] }));
  let g = games[games.length - 1];
  if (g.rallies.length === 0 && games.length > 1) {
    // Nothing in this game yet: step back into the previous game.
    games.pop();
    g = games[games.length - 1];
  }
  g.rallies.pop();
  return { games };
}

// Start the next game, or a fresh match when the match is already decided.
// The winner of the previous game serves first in the next one.
export function nextGame(state, rules) {
  const winner = gameWinner(currentGame(state), rules);
  if (winner === null) return state;
  if (matchWinner(state, rules) !== null) return newMatch(winner);
  return { games: [...state.games, { firstServer: winner, rallies: [] }] };
}

// Mid-game interval / change of ends in the deciding game when the leader reaches 11 (for 21-point games).
export function isDecidingGame(state, rules) {
  return state.games.length === rules.bestOf;
}

// 'match' or 'game' when either side wins the game (or the match) with the next rally, else null.
// Umpires call it right after the server's score: "20 game point 6", "29 match point all".
export function pointCall(state, rules) {
  if (isGameOver(state, rules)) return null;
  const g = currentGame(state);
  const won = gamesWon(state, rules);
  const need = Math.ceil(rules.bestOf / 2);
  let call = null;
  for (const team of [0, 1]) {
    const next = { ...g, rallies: [...g.rallies, team] };
    if (gameWinner(next, rules) !== team) continue;
    if (won[team] + 1 >= need) return 'match';
    call = 'game';
  }
  return call;
}

// Players change ends after every game, and in the deciding game when the leader reaches the
// midpoint (11 in a 21-point game). True when the teams stand on the opposite ends from where
// they started the match.
export function endsChanged(state, rules) {
  let changes = state.games.length - 1;
  const g = currentGame(state);
  if (isDecidingGame(state, rules) && Math.max(...gameScore(g)) >= Math.ceil(rules.points / 2)) changes++;
  return changes % 2 === 1;
}
