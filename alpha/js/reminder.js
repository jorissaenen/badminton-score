// When to remind people of an event. A reminder is { daysBefore, time }: so many days before the
// event's date, at that time of day. That works for a single date and for every date of a weekly
// series alike. null means no reminder.

// Smart default: an afternoon or evening event is reminded the same morning, a morning event the
// evening before. Both leave time to answer and to plan the day.
export function smartReminder(start) {
  return start >= '12:00' ? { daysBefore: 0, time: '09:00' } : { daysBefore: 1, time: '19:00' };
}

const pad = (n) => String(n).padStart(2, '0');

// The moment of the reminder for an event on `date` (YYYY-MM-DD), in this device's time zone.
export function remindAt(date, reminder) {
  if (!reminder) return null;
  const d = new Date(`${date}T${reminder.time}:00`);
  d.setDate(d.getDate() - reminder.daysBefore);
  return d;
}

export function sameReminder(a, b) {
  return (a ?? null) === (b ?? null) || (a && b && a.daysBefore === b.daysBefore && a.time === b.time);
}

function moment(date, reminder) {
  const d = remindAt(date, reminder);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The choices offered for an event starting at `start`: value → { label, reminder }. 'other' lets
// the admin pick the day and time themselves.
export function reminderChoices(date, start) {
  const choices = { smart: { reminder: smartReminder(start), label: 'Smart (recommended)' } };
  for (const n of [1, 2, 3]) {
    choices[`d${n}`] = { reminder: { daysBefore: n, time: start }, label: `${n} day${n === 1 ? '' : 's'} before` };
  }
  choices.other = { reminder: null, label: 'Other day and time…' };
  choices.none = { reminder: null, label: 'No reminder' };
  return choices;
}

// "Tue 3 Nov, 09:00: the same morning", shown under the choice.
export function describeReminder(date, reminder) {
  if (!reminder) return 'Nobody gets a reminder for this event.';
  const when = reminder.daysBefore === 0 ? 'the same day'
    : reminder.daysBefore === 1 ? 'the day before' : `${reminder.daysBefore} days before`;
  const part = reminder.daysBefore === 0 && reminder.time < '12:00' ? 'the same morning'
    : reminder.daysBefore === 1 && reminder.time >= '17:00' ? 'the evening before' : when;
  return `Everyone who hasn’t said no gets a reminder on ${moment(date, reminder)}: ${part}.`;
}

// Which choice a stored reminder corresponds to (for editing).
export function choiceFor(reminder, date, start) {
  if (reminder === null) return 'none';
  if (reminder === undefined) return 'smart';
  const choices = reminderChoices(date, start);
  return Object.keys(choices).find((k) => choices[k].reminder && sameReminder(choices[k].reminder, reminder)) ?? 'other';
}
