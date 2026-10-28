// Which reminders are due, and what they say. Plain functions, unit-tested in
// tests/reminders.test.js; index.js does the database work and the sending.

export const REMINDERS = [
  { key: 'day', before: 24 * 3600_000 },
  { key: 'hours', before: 3 * 3600_000 },
];

const TYPES = {
  training: 'Training',
  random: 'Random tournament',
  weighted: 'Weighted tournament',
  knockout: 'Knockout tournament',
};

// The reminder to send now for an event, or null. When several are due at once (an event planned
// at short notice, or the function was down), only the latest one is sent; all are marked sent.
export function dueReminder(event, now) {
  if (event.status === 'cancelled') return null;
  const start = event.startsAt;
  if (start <= now) return null;
  const due = REMINDERS.filter((r) => start - r.before <= now && !event.reminded?.[r.key]);
  if (!due.length) return null;
  return { send: due.at(-1).key, mark: due.map((r) => r.key) };
}

function dayWord(event, now, timeZone) {
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const today = fmt(now);
  const tomorrow = fmt(new Date(now.getTime() + 24 * 3600_000));
  if (event.date === today) return 'today';
  if (event.date === tomorrow) return 'tomorrow';
  return new Date(`${event.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

// status: the person's answer ('going', 'not going') or undefined. People who said they're not
// coming get no reminder.
export function reminderText(event, clubName, status, now, timeZone = 'Europe/Brussels') {
  if (status === 'not going') return null;
  const what = TYPES[event.type] ?? 'Event';
  const when = `${dayWord(event, now, timeZone)} ${event.start}–${event.end}`;
  const where = event.location ? ` · ${event.location}` : '';
  return {
    title: `${what} ${when}`,
    body: status === 'going'
      ? `${clubName}${where}. You said you’re coming. Tap to change.`
      : `${clubName}${where}. Are you coming? Tap to answer.`,
  };
}
