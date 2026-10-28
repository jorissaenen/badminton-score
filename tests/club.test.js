import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignableRoles, currentSeason, nextSeasonSuggestion, parseJoin, weeklyDates, startsAt, isoDate,
} from '../alpha/js/club.js';

test('weekly dates: same weekday, both ends included', () => {
  assert.deepEqual(weeklyDates('2026-11-03', '2026-11-24'), ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
  assert.deepEqual(weeklyDates('2026-11-03', '2026-11-09'), ['2026-11-03']);
  assert.deepEqual(weeklyDates('2026-11-03', '2026-11-02'), []);
});

test('weekly dates keep the weekday across the change to winter time', () => {
  const dates = weeklyDates('2026-10-20', '2026-11-03');
  assert.deepEqual(dates, ['2026-10-20', '2026-10-27', '2026-11-03']);
  assert.ok(dates.every((d) => new Date(`${d}T12:00:00`).getDay() === 2));
});

test('start time is local', () => {
  const d = startsAt('2026-11-03', '20:00');
  assert.equal(d.getHours(), 20);
  assert.equal(isoDate(d), '2026-11-03');
});

test('season suggestion and current season', () => {
  assert.deepEqual(nextSeasonSuggestion([], new Date(2026, 9, 28)), { name: '2026–27', start: '2026-09-01', end: '2027-06-30' });
  assert.equal(nextSeasonSuggestion([{ start: '2026-09-01', end: '2027-06-30' }], new Date(2026, 9, 28)).name, '2027–28');
  const seasons = [{ id: 'a', start: '2025-09-01', end: '2026-06-30' }, { id: 'b', start: '2026-09-01', end: '2027-06-30' }];
  assert.equal(currentSeason(seasons, '2026-10-28').id, 'b');
  assert.equal(currentSeason(seasons, '2026-08-01').id, 'b'); // between seasons: the latest
});

test('roles someone may give', () => {
  assert.deepEqual(assignableRoles('admin', 'member', false), ['admin', 'keeper', 'member']);
  assert.deepEqual(assignableRoles('admin', 'owner', false), []);
  assert.deepEqual(assignableRoles('owner', 'owner', true), []);
  assert.deepEqual(assignableRoles('member', 'member', false), []);
});

test('invite links', () => {
  assert.deepEqual(parseJoin('?join=abc123.ABCDEFGHIJKLMNOPQRSTUV_-'), { clubId: 'abc123', token: 'ABCDEFGHIJKLMNOPQRSTUV_-' });
  assert.equal(parseJoin('?join=abc.short'), null);
});
