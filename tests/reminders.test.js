import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderDue, reminderText } from '../functions/reminders.js';

const H = 3600_000;
const start = new Date('2026-11-03T19:00:00Z'); // 20:00 in Brussels
const event = { type: 'training', date: '2026-11-03', start: '20:00', end: '21:30', location: 'Sporthal', startsAt: start, status: 'planned' };

test('due once its moment has come, until the event starts', () => {
  const e = { ...event, remindAt: new Date(start - 11 * H) }; // 09:00 the same day
  assert.equal(reminderDue(e, new Date(start - 12 * H)), false);
  assert.equal(reminderDue(e, new Date(start - 10 * H)), true);
  assert.equal(reminderDue({ ...e, reminded: true }, new Date(start - 10 * H)), false);
  assert.equal(reminderDue(e, new Date(start.getTime() + H)), false);
});

test('never for cancelled events or events without a reminder', () => {
  assert.equal(reminderDue({ ...event, status: 'cancelled', remindAt: new Date(start - 11 * H) }, new Date(start - H)), false);
  assert.equal(reminderDue({ ...event, remindAt: null }, new Date(start - H)), false);
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
