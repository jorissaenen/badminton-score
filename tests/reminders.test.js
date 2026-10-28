import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminder, reminderText } from '../functions/reminders.js';

const H = 3600_000;
const start = new Date('2026-11-03T19:00:00Z'); // 20:00 in Brussels
const event = { type: 'training', date: '2026-11-03', start: '20:00', end: '21:30', location: 'Sporthal', startsAt: start, status: 'planned' };

test('a day before: the day reminder', () => {
  assert.equal(dueReminder(event, new Date(start - 25 * H)), null);
  assert.deepEqual(dueReminder(event, new Date(start - 23.9 * H)), { send: 'day', mark: ['day'] });
});

test('3 hours before: the hours reminder, once', () => {
  const after = { ...event, reminded: { day: true } };
  assert.equal(dueReminder(after, new Date(start - 4 * H)), null);
  assert.deepEqual(dueReminder(after, new Date(start - 2.9 * H)), { send: 'hours', mark: ['hours'] });
  assert.equal(dueReminder({ ...after, reminded: { day: true, hours: true } }, new Date(start - 2 * H)), null);
});

test('planned at short notice: only the latest reminder, both marked', () => {
  assert.deepEqual(dueReminder(event, new Date(start - 2 * H)), { send: 'hours', mark: ['day', 'hours'] });
});

test('nothing for cancelled or past events', () => {
  assert.equal(dueReminder({ ...event, status: 'cancelled' }, new Date(start - 2 * H)), null);
  assert.equal(dueReminder(event, new Date(start.getTime() + H)), null);
});

test('texts: tomorrow / today, by answer; nothing for people not coming', () => {
  const dayBefore = new Date('2026-11-02T19:00:00Z');
  assert.deepEqual(reminderText(event, 'BC Smash', undefined, dayBefore), {
    title: 'Training tomorrow 20:00–21:30',
    body: 'BC Smash · Sporthal. Are you coming? Tap to answer.',
  });
  assert.equal(reminderText(event, 'BC Smash', 'going', new Date('2026-11-03T16:00:00Z')).title, 'Training today 20:00–21:30');
  assert.match(reminderText(event, 'BC Smash', 'going', dayBefore).body, /You said you’re coming/);
  assert.equal(reminderText(event, 'BC Smash', 'not going', dayBefore), null);
});
