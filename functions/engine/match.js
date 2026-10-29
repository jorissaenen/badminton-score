// Pure match logic for every sport in sports.js. No DOM access, so it can be unit-tested.
//
// State shape (the same for every sport):
//   { games: [{ firstServer: 0|1, rallies: [0|1, ...], points? }, ...] }
// Team 0 is the home team, team 1 is the away team. Each entry in `games` is one game (rally
// sports) or one set (tennis, padel); `rallies` lists who won each point. Everything else (scores,
// server, winners, ends) is derived from that history, which makes "undo" a simple pop.
//
// Rules: { sport, points, cap, bestOf } for rally sports, { sport, bestOf, golden,
// matchTiebreak } for tennis and padel (see rulesFor in sports.js). Without `sport`: badminton.
import { DEFAULT_SPORT, sportOf } from './sports.js';

export const DEFAULT_RULES = { sport: DEFAULT_SPORT, points: 21, cap: 30, bestOf: 3 };

const sport = (rules) => sportOf(rules?.sport ?? DEFAULT_SPORT);
const isTennis = (rules) => sport(rules).scoring === 'tennis';

// Badminton's cap for a game length (21 → 30); other sports have none.
export function capFor(points, sportId = DEFAULT_SPORT) {
  return sportOf(sportId).cap?.[points] ?? null;
}

export function newMatch(firstServer = 0) {
  return { games: [{ firstServer, rallies: [] }] };
}

export function currentGame(state) {
  return state.games[state.games.length - 1];
}

// ---------- tennis and padel: one entry in `games` is a set ----------

const SET_GAMES = 6;

// Replays a set's points. Returns the games, the points in the current game (or tiebreak), who
// serves now, whether it's a tiebreak, the winner (or null) and how often the players changed ends.
export function tennisSet(set, rules, matchTiebreak = false) {
  const games = [0, 0];
  let pts = [0, 0];
  let tiebreak = matchTiebreak;
  let gameServer = set.firstServer; // who serves the current game
  let tbFirst = set.firstServer; // who served the first point of the tiebreak
  let tbPoints = 0;
  let winner = null;
  let changes = 0;
  let nextFirst = null; // who serves first in the next set
  for (const w of set.rallies) {
    if (winner !== null) break;
    pts = pts.map((p, i) => (i === w ? p + 1 : p));
    const lead = pts[w] - pts[1 - w];
    if (tiebreak) {
      tbPoints += 1;
      if (pts[w] >= (matchTiebreak ? 10 : 7) && lead >= 2) {
        games[w] += 1;
        winner = w;
        changes += 1; // the tiebreak counts as an odd game: change ends after it
        nextFirst = 1 - tbFirst; // who received first in the tiebreak
      } else if (tbPoints % 6 === 0) changes += 1; // every 6 points
      continue;
    }
    // 40-40 (deuce): win by 2, or with a golden point the next point wins.
    if (pts[w] >= 4 && (lead >= 2 || (rules.golden && pts[1 - w] === 3))) {
      games[w] += 1;
      pts = [0, 0];
      if ((games[0] + games[1]) % 2 === 1) changes += 1; // after the 1st, 3rd, 5th… game
      gameServer = 1 - gameServer;
      const gl = games[w] - games[1 - w];
      if (games[w] >= SET_GAMES && gl >= 2) {
        winner = w;
        nextFirst = gameServer;
      } else if (games[0] === SET_GAMES && games[1] === SET_GAMES) {
        tiebreak = true;
        tbFirst = gameServer;
      }
    }
  }
  let server = gameServer;
  if (tiebreak && winner === null) {
    // First point by tbFirst, then two each: A B B A A B B …
    const k = tbPoints;
    server = k === 0 ? tbFirst : Math.floor((k - 1) / 2) % 2 === 0 ? 1 - tbFirst : tbFirst;
  }
  return { games, points: pts, tiebreak, server, winner, changes, nextFirst: nextFirst ?? gameServer };
}

const isMatchTiebreak = (state, rules, index) => Boolean(rules.matchTiebreak) && rules.bestOf > 1 && index === rules.bestOf - 1;
const setOf = (state, rules, index = state.games.length - 1) => tennisSet(state.games[index], rules, isMatchTiebreak(state, rules, index));

// What a tennis player hears and sees for the current game: '0', '15', '30', '40', 'AD', or
// the tiebreak points.
export function tennisPoints(state, rules) {
  const s = setOf(state, rules);
  if (s.tiebreak) return s.points.map(String);
  const [a, b] = s.points;
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];
    return a > b ? ['AD', '40'] : ['40', 'AD'];
  }
  return s.points.map((p) => ['0', '15', '30', '40'][p]);
}

// ---------- every sport ----------

// The score of one game (rally sports: points; tennis: the games in that set).
export function gameScore(game, rules = DEFAULT_RULES, matchTiebreak = false) {
  if (isTennis(rules)) return tennisSet(game, rules, matchTiebreak).games;
  const s = [0, 0];
  for (const w of game.rallies) s[w]++;
  return s;
}

// The score of every game (set) of the match, in order.
export function gameScores(state, rules = DEFAULT_RULES) {
  return state.games.map((g, i) => gameScore(g, rules, isTennis(rules) && isMatchTiebreak(state, rules, i)));
}

export function gameWinner(game, rules = DEFAULT_RULES, matchTiebreak = false) {
  if (isTennis(rules)) return tennisSet(game, rules, matchTiebreak).winner;
  const [a, b] = gameScore(game);
  const points = game.points ?? rules.points;
  const cap = rules.cap ?? null;
  for (const [me, other, team] of [[a, b, 0], [b, a, 1]]) {
    if (cap && me >= cap) return team;
    if (me >= points && me - other >= 2) return team;
  }
  return null;
}

const winnerAt = (state, rules, i) => gameWinner(state.games[i], rules, isTennis(rules) && isMatchTiebreak(state, rules, i));

export function gamesWon(state, rules = DEFAULT_RULES) {
  const won = [0, 0];
  state.games.forEach((_, i) => {
    const w = winnerAt(state, rules, i);
    if (w !== null) won[w]++;
  });
  return won;
}

export function matchWinner(state, rules = DEFAULT_RULES) {
  const need = Math.ceil(rules.bestOf / 2);
  const won = gamesWon(state, rules);
  if (won[0] >= need) return 0;
  if (won[1] >= need) return 1;
  return null;
}

// Who won the current game (set), or null.
export const currentWinner = (state, rules = DEFAULT_RULES) => winnerAt(state, rules, state.games.length - 1);

export function isGameOver(state, rules = DEFAULT_RULES) {
  return winnerAt(state, rules, state.games.length - 1) !== null;
}

// Who serves now. Rally sports: the rally winner (badminton, squash, …), or in turns (table
// tennis: two serves each, one each from 10-10). Tennis: per game, in turns.
export function server(game, rules = DEFAULT_RULES, state = null) {
  if (isTennis(rules)) {
    const i = state ? state.games.indexOf(game) : -1;
    return tennisSet(game, rules, state ? isMatchTiebreak(state, rules, i) : false).server;
  }
  const r = game.rallies;
  if (sport(rules).serve === 'turns') {
    const points = game.points ?? rules.points;
    const every = points >= 21 ? 5 : 2;
    const n = r.length;
    const deuce = 2 * (points - 1);
    const [a, b] = gameScore(game);
    const turn = (k) => (Math.floor(k / every) % 2 === 0 ? game.firstServer : 1 - game.firstServer);
    if (n >= deuce && Math.min(a, b) >= points - 1) {
      const base = turn(deuce);
      return (n - deuce) % 2 === 0 ? base : 1 - base;
    }
    return turn(n);
  }
  return r.length ? r[r.length - 1] : game.firstServer;
}

// Serving court for the current server (badminton): even score → right, odd → left.
export function serviceCourt(game, rules = DEFAULT_RULES) {
  const s = gameScore(game)[server(game, rules)];
  return s % 2 === 0 ? 'right' : 'left';
}

export function addPoint(state, team, rules = DEFAULT_RULES) {
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

export function isDecidingGame(state, rules = DEFAULT_RULES) {
  return state.games.length === rules.bestOf;
}

// Start the next game (set), or a fresh match when the match is already decided. Who serves
// first depends on the sport: the winner of the game (badminton, squash), the other side
// (table tennis, pickleball, beach volleyball), or the next in turn (tennis).
export function nextGame(state, rules = DEFAULT_RULES) {
  const last = currentGame(state);
  const winner = winnerAt(state, rules, state.games.length - 1);
  if (winner === null) return state;
  if (matchWinner(state, rules) !== null) return newMatch(winner);
  const sp = sport(rules);
  let firstServer;
  if (sp.scoring === 'tennis') firstServer = setOf(state, rules).nextFirst;
  else firstServer = sp.nextFirst === 'winner' ? winner : 1 - last.firstServer;
  const next = { firstServer, rallies: [] };
  if (sp.deciderPoints && state.games.length + 1 === rules.bestOf) next.points = sp.deciderPoints;
  return { games: [...state.games, next] };
}

// 'match', 'set' (tennis) or 'game' when a side wins it with the next point, else null.
// Umpires call it right after the server's score: "20 game point 6", "29 match point all".
// Tennis only calls set point and match point.
export function pointCall(state, rules = DEFAULT_RULES) {
  if (isGameOver(state, rules)) return null;
  const won = gamesWon(state, rules);
  const need = Math.ceil(rules.bestOf / 2);
  let call = null;
  for (const team of [0, 1]) {
    const next = addPoint(state, team, rules);
    if (winnerAt(next, rules, next.games.length - 1) !== team) continue;
    if (won[team] + 1 >= need) return 'match';
    call = isTennis(rules) ? 'set' : 'game';
  }
  return call;
}

// True when the sides stand on the opposite ends from where they started the match.
// Badminton: after every game, and at 11 in the deciding game. Table tennis: at 5. Beach
// volleyball: every 7 points (5 in the third set) and after each set. Squash: never. Tennis:
// after the 1st, 3rd, 5th… game of each set, and every 6 points in a tiebreak.
export function endsChanged(state, rules = DEFAULT_RULES) {
  const sp = sport(rules);
  if (sp.scoring === 'tennis') {
    const changes = state.games.reduce((n, _, i) => n + setOf(state, rules, i).changes, 0);
    return changes % 2 === 1;
  }
  const ends = sp.ends;
  if (!ends) return false;
  let changes = ends.afterGame ? state.games.length - 1 : 0;
  if (ends.every) {
    state.games.forEach((g, i) => {
      const every = i + 1 === rules.bestOf && ends.deciderEvery ? ends.deciderEvery : ends.every;
      const [a, b] = gameScore(g);
      const w = winnerAt(state, rules, i);
      changes += Math.floor((a + b - (w !== null && (a + b) % every === 0 ? 1 : 0)) / every);
    });
  } else if (ends.decider && isDecidingGame(state, rules)) {
    const g = currentGame(state);
    const points = g.points ?? rules.points;
    const at = ends.decider === 'floor' ? Math.floor(points / 2) : Math.ceil(points / 2);
    if (Math.max(...gameScore(g)) >= at) changes++;
  }
  return changes % 2 === 1;
}

// The midpoint of the current game where badminton has its interval (and the decider its change
// of ends): 11 in a game to 21. Null for sports without it.
export function midpoint(state, rules = DEFAULT_RULES) {
  const sp = sport(rules);
  if (sp.scoring !== 'rally' || !sp.ends?.decider) return null;
  const points = currentGame(state).points ?? rules.points;
  return sp.ends.decider === 'floor' ? Math.floor(points / 2) : Math.ceil(points / 2);
}

// What the scoreboard shows for each side: the big two-character tiles ('07', '15', 'AD'), and
// for tennis the games in the current set.
export function display(state, rules = DEFAULT_RULES) {
  if (isTennis(rules)) {
    const s = setOf(state, rules);
    const tiles = tennisPoints(state, rules).map((p) => p.padStart(2, '0'));
    return { tiles, games: s.games, tiebreak: s.tiebreak };
  }
  return { tiles: gameScore(currentGame(state)).map((n) => String(n).padStart(2, '0')), games: null, tiebreak: false };
}
