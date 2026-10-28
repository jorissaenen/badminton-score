import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../beta/js/match.js';

const R = { points: 21, cap: 30, bestOf: 3 };
const play = (state, seq) => seq.reduce((s, t) => M.addPoint(s, t, R), state);
const times = (team, n) => Array(n).fill(team);

test('21 points wins a game, win by 2, cap at 30', () => {
  let s = play(M.newMatch(), times(0, 21));
  assert.equal(M.gameWinner(M.currentGame(s), R), 0);

  s = play(M.newMatch(), [...Array(20)].flatMap(() => [0, 1]).concat(0));
  assert.equal(M.isGameOver(s, R), false, '21-20 is not over');
  s = play(s, [0]);
  assert.equal(M.gameWinner(M.currentGame(s), R), 0, '22-20 wins');

  s = play(M.newMatch(), [...Array(29)].flatMap(() => [0, 1]).concat(1));
  assert.equal(M.gameWinner(M.currentGame(s), R), 1, '30-29 wins at the cap');
});

test('points are ignored after the game ends', () => {
  const s = play(M.newMatch(), times(0, 21));
  assert.deepEqual(M.gameScore(M.currentGame(play(s, [1, 1]))), [21, 0]);
});

test('server is rally winner; court follows score parity', () => {
  let s = M.newMatch(1);
  assert.equal(M.server(M.currentGame(s)), 1);
  assert.equal(M.serviceCourt(M.currentGame(s)), 'right');
  s = play(s, [0]);
  assert.equal(M.server(M.currentGame(s)), 0);
  assert.equal(M.serviceCourt(M.currentGame(s)), 'left');
});

test('undo removes last point, also across a game boundary', () => {
  let s = play(M.newMatch(), [0, 1, 1]);
  s = M.undo(s);
  assert.deepEqual(M.gameScore(M.currentGame(s)), [1, 1]);

  s = M.nextGame(play(M.newMatch(), times(0, 21)), R);
  assert.equal(s.games.length, 2);
  s = M.undo(s);
  assert.equal(s.games.length, 1);
  assert.deepEqual(M.gameScore(M.currentGame(s)), [20, 0]);

  assert.deepEqual(M.undo(M.newMatch()), M.newMatch(), 'undo on empty match is a no-op');
});

test('next game: winner serves first; match ends at 2 games', () => {
  let s = play(M.newMatch(), times(1, 21));
  assert.equal(M.nextGame(play(M.newMatch(), [0]), R).games.length, 1, 'no next game mid-game');
  s = M.nextGame(s, R);
  assert.equal(M.server(M.currentGame(s)), 1);
  s = M.nextGame(play(s, times(1, 21)), R);
  // match won 2-0 -> nextGame starts a fresh match
  assert.equal(s.games.length, 1);
  assert.deepEqual(M.gameScore(M.currentGame(s)), [0, 0]);

  s = play(M.newMatch(), times(1, 21));
  s = play(M.nextGame(s, R), times(1, 21));
  assert.equal(M.matchWinner(s, R), 1);
});

test('game point and match point (rules)', () => {
  const alt = (n) => [...Array(n)].flatMap(() => [0, 1]);
  let s = play(M.newMatch(), times(0, 19));
  assert.equal(M.pointCall(s, R), null, '19-0');
  assert.equal(M.pointCall(play(s, [0]), R), 'game', '20-0 in game 1');
  assert.equal(M.pointCall(play(M.newMatch(), alt(20)), R), null, '20 all: nobody wins with one rally');
  assert.equal(M.pointCall(play(M.newMatch(), [...alt(20), 1]), R), 'game', '20-21');
  assert.equal(M.pointCall(play(M.newMatch(), alt(29)), R), 'game', '29 all');
  assert.equal(M.pointCall(play(M.newMatch(), times(0, 21)), R), null, 'game over');

  // Home won game 1: 20-0 in game 2 is match point for home, game point for away at 0-20.
  const g2 = M.nextGame(play(M.newMatch(), times(0, 21)), R);
  assert.equal(M.pointCall(play(g2, times(0, 20)), R), 'match');
  assert.equal(M.pointCall(play(g2, times(1, 20)), R), 'game');
  // 29 all in game 2: home's win would take the match, so it's match point.
  assert.equal(M.pointCall(play(g2, alt(29)), R), 'match');
  // Single-game match: every game point is a match point.
  assert.equal(M.pointCall(play(M.newMatch(), times(1, 20)), { ...R, bestOf: 1 }), 'match');
});

test('change of ends: after each game and at 11 in the deciding game', () => {
  const g1 = M.newMatch();
  assert.equal(M.endsChanged(g1, R), false, 'game 1 start');
  assert.equal(M.endsChanged(play(g1, times(0, 11)), R), false, 'no mid-game change in game 1');
  const g2 = M.nextGame(play(g1, times(0, 21)), R);
  assert.equal(M.endsChanged(g2, R), true, 'game 2');
  const g3 = M.nextGame(play(g2, times(1, 21)), R);
  assert.equal(M.endsChanged(g3, R), false, 'game 3 start: back to the original ends');
  assert.equal(M.endsChanged(play(g3, times(0, 10)), R), false, '10-0 in game 3');
  assert.equal(M.endsChanged(play(g3, times(0, 11)), R), true, '11-0 in game 3: change ends');
  assert.equal(M.endsChanged(M.undo(play(g3, times(0, 11))), R), false, 'undo back to 10 swaps back');
});
