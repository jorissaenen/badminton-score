// What is said after a point, for every sport: used by the scoreboard on the phone and by a linked
// screen that announces the score.
import * as M from './match.js';
import { sportOf } from './sports.js';
import { t, people } from './i18n.js';

const isTennis = (rules) => sportOf(rules.sport).scoring === 'tennis';

// The score, server's score first. Rally sports: "20, match point, 0", "29 all". Tennis: "15 love",
// "30 all", "deuce", "advantage Joris"; a tiebreak like a rally game.
export function scoreCall(match, rules, names) {
  const srv = M.server(M.currentGame(match), rules, match);
  const call = M.pointCall(match, rules);
  const point = call ? t(`call.${call}Point`) : '';
  if (isTennis(rules) && !M.display(match, rules).tiebreak) {
    const p = M.tennisPoints(match, rules);
    const word = (x) => (x === '0' ? t('call.love') : x);
    let text;
    if (p[0] === '40' && p[1] === '40') text = t('call.deuce');
    else if (p.includes('AD')) text = t('call.advantage', { name: names[p[0] === 'AD' ? 0 : 1] });
    else if (p[srv] === p[1 - srv]) text = t('call.all', { a: word(p[srv]) });
    else text = t('call.score', { a: word(p[srv]), b: word(p[1 - srv]) });
    return point ? `${text}. ${point}` : text;
  }
  const sc = isTennis(rules) ? M.display(match, rules).tiles.map(Number) : M.gameScore(M.currentGame(match), rules);
  const a = sc[srv];
  const b = sc[1 - srv];
  if (call) return t(a === b ? 'call.pointAll' : 'call.point', { a, b, point });
  return t(a === b ? 'call.all' : 'call.score', { a, b });
}

// "6 4, 6 3": the score of every game (set), winner first.
export const results = (match, rules) => M.gameScores(match, rules).map((x) => `${Math.max(...x)} ${Math.min(...x)}`).join(', ');

// What to say when the score went from `before` to `after` (one point more), for a screen that
// follows a match: the score, a game or set won, or the match won. Null when nothing changed.
export function announcement(before, after, rules, names) {
  const count = (m) => m.games.reduce((n, g) => n + g.rallies.length, 0);
  if (!after || count(after) === count(before ?? { games: [] })) return null;
  if (count(after) < count(before ?? { games: [] })) return t('call.undo', { score: scoreCall(after, rules, names) });
  const g = M.currentGame(after);
  const team = g.rallies.at(-1) ?? 0;
  const name = names[team];
  if (M.isGameOver(after, rules)) {
    const tennis = isTennis(rules);
    if (M.matchWinner(after, rules) !== null) return t(tennis ? 'call.setAndMatch' : 'call.gameAndMatch', { name, result: results(after, rules), count: people(name) });
    const sc = M.gameScore(g, rules);
    return t(tennis ? 'call.set' : 'call.game', { name, result: tennis ? sc.join(' ') : `${Math.max(...sc)} ${Math.min(...sc)}` });
  }
  if (g.rallies.length === 0) {
    const server = names[M.server(g, rules, after)];
    return t(isTennis(rules) ? 'call.nextSet' : 'call.nextGame', { n: after.games.length, name: server, count: people(server) });
  }
  if (isTennis(rules) && before) {
    const was = M.display(before, rules).games;
    const now = M.display(after, rules).games;
    if (was && now && now[team] !== was[team]) return t('call.tennisGame', { name, a: now[team], b: now[1 - team] });
  }
  return scoreCall(after, rules, names);
}

// What the players have to know after a change of the score, besides the score: 'interval',
// 'intervalEnds' (the interval, and change ends: the decider), 'ends' (change ends: mid-game, or
// as the next game starts) or null. Undos and unchanged scores give null.
export function notice(before, after, rules) {
  const count = (m) => m.games.reduce((n, g) => n + g.rallies.length, 0) + m.games.length;
  if (!before || !after || count(after) <= count(before) || M.isGameOver(after, rules)) return null;
  const ends = M.endsChanged(after, rules) !== M.endsChanged(before, rules);
  if (M.intervalNow(after, rules)) return ends ? 'intervalEnds' : 'interval';
  return ends ? 'ends' : null;
}
