import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceFor, describeReminder, remindAt, reminderChoices, smartReminder } from '../alpha/js/reminder.js';

test('smart: evening and afternoon events the same morning, morning events the evening before', () => {
  assert.deepEqual(smartReminder('20:00'), { daysBefore: 0, time: '09:00' });
  assert.deepEqual(smartReminder('14:00'), { daysBefore: 0, time: '09:00' });
  assert.deepEqual(smartReminder('12:00'), { daysBefore: 0, time: '09:00' });
  assert.deepEqual(smartReminder('10:00'), { daysBefore: 1, time: '19:00' });
});

test('the reminder moment, across a month boundary', () => {
  const d = remindAt('2026-12-01', { daysBefore: 1, time: '19:00' });
  assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()], [2026, 11, 30, 19]);
  assert.equal(remindAt('2026-12-01', null), null);
});

test('choices; the description says when; a stored reminder maps back to its choice', () => {
  const c = reminderChoices('2026-11-03', '20:00');
  assert.deepEqual(Object.keys(c), ['smart', 'd1', 'd2', 'd3', 'other', 'none']);
  assert.match(describeReminder('2026-11-03', c.smart.reminder), /09:00: the same morning\.$/);
  assert.match(describeReminder('2026-11-03', smartReminder('10:00')), /19:00: the evening before\.$/);
  assert.match(describeReminder('2026-11-03', null), /Nobody/);
  assert.deepEqual(c.d2.reminder, { daysBefore: 2, time: '20:00' });
  assert.equal(choiceFor(undefined, '2026-11-03', '20:00'), 'smart');
  assert.equal(choiceFor({ daysBefore: 0, time: '09:00' }, '2026-11-03', '20:00'), 'smart');
  assert.equal(choiceFor({ daysBefore: 2, time: '20:00' }, '2026-11-03', '20:00'), 'd2');
  assert.equal(choiceFor({ daysBefore: 4, time: '08:00' }, '2026-11-03', '20:00'), 'other');
  assert.equal(choiceFor(null, '2026-11-03', '20:00'), 'none');
});
