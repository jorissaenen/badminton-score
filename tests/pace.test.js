import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointMs, pollIn, endsAt, USUAL_POINT_MS } from '../functions/pace.js';

const ts = (ms) => ({ toMillis: () => ms });
const R = { sport: 'badminton', points: 21, cap: 30, bestOf: 3 };
const NOW = 1_800_000_000_000;
const match = (rallies, { startedAt = NOW - 60_000, finishedAt, home = [{ id: 'joris', name: 'Joris' }], status = 'live', rules = R } = {}) => ({
  rules, status, home, away: [{ name: 'Lies' }], startedAt: ts(startedAt), ...(finishedAt && { finishedAt: ts(finishedAt) }),
  state: { games: [{ firstServer: 0, rallies }] },
});

test('pace of a point: usual for the sport at first, then this match\'s own rhythm', () => {
  assert.equal(pointMs(match([0, 1])), USUAL_POINT_MS.badminton, 'two points: too early to tell');
  assert.equal(pointMs(match([0, 1]), [], NOW), USUAL_POINT_MS.badminton);
  // 10 points in 100 s: 10 s a point, weighed with the usual 18 s.
  assert.equal(pointMs(match(Array(10).fill(0), { startedAt: NOW - 100_000 }), [], NOW), Math.round(10_000 * 0.7 + 18_000 * 0.3));
  assert.equal(pointMs(match([0]), [], NOW, { ...R, sport: 'tabletennis' }), USUAL_POINT_MS.badminton, 'sport from the match rules');
  assert.equal(pointMs(match([0], { rules: { ...R, sport: 'tabletennis' } }), [], NOW), USUAL_POINT_MS.tabletennis);
});

test('pace: the same players\' earlier matches of the evening count; strangers\' don\'t', () => {
  const quick = match(Array(40).fill(0), { status: 'finished', startedAt: NOW - 3_600_000, finishedAt: NOW - 3_600_000 + 400_000 }); // 10 s a point
  const strangers = { ...quick, home: [{ name: 'Someone' }], away: [{ name: 'Else' }] };
  assert.equal(pointMs(match([0]), [quick], NOW), 10_000);
  assert.equal(pointMs(match([0]), [strangers], NOW), USUAL_POINT_MS.badminton);
  assert.equal(pointMs(match([0]), [{ ...quick, status: 'live' }], NOW), USUAL_POINT_MS.badminton, 'only finished matches');
});

test('the list: soon when a court is about to come free, calm otherwise', () => {
  const playing = match(Array(5).fill(0));
  const matchPoint = { ...match([]), rules: { ...R, bestOf: 1 }, state: { games: [{ firstServer: 0, rallies: Array(20).fill(0) }] } };
  assert.equal(pollIn([playing, matchPoint], [], NOW), 6);
  assert.equal(pollIn([playing], [], NOW), 20);
  assert.equal(pollIn([], [{ startsAt: NOW - 600_000, endsAt: NOW + 3_600_000 }], NOW), 10, 'event on, no match yet');
  assert.equal(pollIn([], [{ startsAt: NOW + 3_600_000, endsAt: NOW + 7_200_000 }], NOW), 300, 'event later today: every 5 minutes');
  assert.equal(pollIn([], [{ startsAt: NOW + 120_000, endsAt: NOW + 7_200_000 }], NOW), 60, 'a minute before the start');
  assert.equal(pollIn([], [], NOW), 600, 'nothing today');
});

test('an event ends at its end time, also after midnight', () => {
  assert.equal(endsAt({ startsAt: ts(0), start: '20:00', end: '22:30' }), 150 * 60_000);
  assert.equal(endsAt({ startsAt: ts(0), start: '22:00', end: '00:30' }), 150 * 60_000);
});
