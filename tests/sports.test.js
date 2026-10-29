import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../alpha/js/match.js';
import { rulesFor, SPORTS } from '../alpha/js/sports.js';

const play = (state, seq, R) => seq.reduce((s, t) => M.addPoint(s, t, R), state);
const times = (team, n) => Array(n).fill(team);
const alt = (n) => [...Array(n)].flatMap(() => [0, 1]);
const game = (team) => times(team, 4); // a tennis game to love

test('rules per sport: defaults, and options outside the sport fall back', () => {
  assert.deepEqual(rulesFor('badminton'), { sport: 'badminton', points: 21, cap: 30, bestOf: 3 });
  assert.deepEqual(rulesFor('tabletennis'), { sport: 'tabletennis', points: 11, cap: null, bestOf: 5 });
  assert.deepEqual(rulesFor('squash', { points: 21 }), { sport: 'squash', points: 11, cap: null, bestOf: 5 });
  assert.deepEqual(rulesFor('tennis', { golden: true }), { sport: 'tennis', bestOf: 3, golden: true, matchTiebreak: false });
  for (const s of SPORTS) assert.ok(rulesFor(s.id).sport === s.id);
});

test('table tennis: to 11, win by 2 without a cap; two serves each, one each from 10-10', () => {
  const R = rulesFor('tabletennis');
  let s = M.newMatch(0);
  const servers = [];
  for (let i = 0; i < 6; i++) { servers.push(M.server(M.currentGame(s), R)); s = play(s, [i % 2], R); }
  assert.deepEqual(servers, [0, 0, 1, 1, 0, 0]);
  s = play(M.newMatch(0), alt(10), R); // 10-10
  assert.equal(M.isGameOver(s, R), false);
  const at = (st) => M.server(M.currentGame(st), R);
  assert.equal(at(s), 0);
  assert.equal(at(play(s, [1], R)), 1);
  assert.equal(at(play(s, [1, 0], R)), 0);
  s = play(s, [0, 1, 0, 1, 0, 1, 0], R); // 14-13
  assert.equal(M.isGameOver(s, R), false, 'no cap: 14-13 goes on');
  assert.equal(M.gameWinner(M.currentGame(play(s, [0], R)), R), 0, '15-13');
  // Next game: who received first serves first.
  const g2 = M.nextGame(play(M.newMatch(0), times(1, 11), R), R);
  assert.equal(M.currentGame(g2).firstServer, 1);
  // Change ends at 5 in the deciding (fifth) game.
  let d = M.newMatch(0);
  for (let i = 0; i < 4; i++) d = M.nextGame(play(d, times(i % 2, 11), R), R);
  assert.equal(M.endsChanged(d, R), false, '4 games played: back at the start ends');
  assert.equal(M.endsChanged(play(d, times(0, 5), R), R), true, '5-0 in the decider');
});

test('squash: winner serves, no cap, never change ends', () => {
  const R = rulesFor('squash');
  let s = play(M.newMatch(0), [1], R);
  assert.equal(M.server(M.currentGame(s), R), 1);
  s = M.nextGame(play(M.newMatch(0), times(1, 11), R), R);
  assert.equal(M.currentGame(s).firstServer, 1);
  assert.equal(M.endsChanged(s, R), false);
});

test('beach volleyball: switch every 7 points, the third set to 15 with switches every 5', () => {
  const R = rulesFor('beachvolleyball');
  assert.equal(M.endsChanged(play(M.newMatch(0), times(0, 6), R), R), false);
  assert.equal(M.endsChanged(play(M.newMatch(0), times(0, 7), R), R), true);
  assert.equal(M.endsChanged(play(M.newMatch(0), times(0, 14), R), R), false);
  let s = M.nextGame(play(M.newMatch(0), times(0, 21), R), R); // switches at 7 and 14, and after the set
  assert.equal(M.endsChanged(s, R), true);
  s = M.nextGame(play(s, times(1, 21), R), R);
  assert.equal(M.currentGame(s).points, 15, 'third set to 15');
  assert.equal(M.gameWinner(M.currentGame(play(s, times(0, 15), R)), R), 0);
});

test('tennis: 15-30-40, deuce and advantage, golden point', () => {
  const R = rulesFor('tennis');
  const pts = (seq, rules = R) => M.tennisPoints(play(M.newMatch(0), seq, rules), rules);
  assert.deepEqual(pts([0, 0, 1]), ['30', '15']);
  assert.deepEqual(pts([0, 1, 0, 1, 0, 1]), ['40', '40']);
  assert.deepEqual(pts([0, 1, 0, 1, 0, 1, 1]), ['40', 'AD']);
  assert.deepEqual(pts([0, 1, 0, 1, 0, 1, 1, 0]), ['40', '40'], 'back to deuce');
  const s = play(M.newMatch(0), [0, 1, 0, 1, 0, 1, 1, 1], R);
  assert.deepEqual(M.display(s, R).games, [0, 1], 'two points clear wins the game');
  const G = rulesFor('padel', { golden: true });
  assert.deepEqual(M.display(play(M.newMatch(0), [0, 1, 0, 1, 0, 1, 1], G), G).games, [0, 1], 'golden point');
});

test('tennis: sets of 6, tiebreak at 6-6, serve in turns, sets to win the match', () => {
  const R = rulesFor('tennis');
  let s = M.newMatch(0);
  const srv = () => M.server(M.currentGame(s), R, s);
  assert.equal(srv(), 0);
  s = play(s, game(0), R);
  assert.equal(srv(), 1, 'serve changes every game');
  s = play(M.newMatch(0), [...game(0), ...game(1)].concat(...Array(5).fill([...game(0), ...game(1)])), R);
  assert.deepEqual(M.display(s, R).games, [6, 6]);
  assert.equal(M.display(s, R).tiebreak, true);
  assert.equal(srv(), 0, 'who would serve the 13th game serves first in the tiebreak');
  assert.equal(M.server(M.currentGame(play(s, [1], R)), R, play(s, [1], R)), 1, 'then two each');
  assert.equal(M.pointCall(play(s, times(0, 6), R), R), 'set', '6-0 in the tiebreak: set point');
  s = play(s, times(0, 7), R);
  assert.equal(M.isGameOver(s, R), true);
  assert.deepEqual(M.gameScore(M.currentGame(s), R), [7, 6]);
  s = M.nextGame(s, R);
  assert.equal(M.currentGame(s).firstServer, 1, 'who received first in the tiebreak serves first');
  s = play(s, Array(6).fill(game(0)).flat(), R);
  assert.equal(M.matchWinner(s, R), 0, 'two sets: match');
  assert.deepEqual(M.gameScores(s, R), [[7, 6], [6, 0]]);
});

test('tennis: match tiebreak to 10 instead of a final set; ends change after odd games', () => {
  const R = rulesFor('tennis', { matchTiebreak: true });
  let s = M.nextGame(play(M.newMatch(0), Array(6).fill(game(0)).flat(), R), R);
  s = M.nextGame(play(s, Array(6).fill(game(1)).flat(), R), R);
  assert.equal(M.display(s, R).tiebreak, true);
  assert.equal(M.isGameOver(play(s, times(0, 9), R), R), false);
  const done = play(s, times(0, 10), R);
  assert.equal(M.matchWinner(done, R), 0);

  const E = rulesFor('tennis');
  const e = (seq) => M.endsChanged(play(M.newMatch(0), seq, E), E);
  assert.equal(e(game(0)), true, 'after game 1');
  assert.equal(e([...game(0), ...game(1)]), true, 'not after game 2');
  assert.equal(e([...game(0), ...game(1), ...game(0)]), false, 'after game 3');
});
