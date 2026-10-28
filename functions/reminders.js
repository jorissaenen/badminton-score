// Whether a reminder is due, and what it says. Plain functions, unit-tested in
// tests/reminders.test.js; index.js does the database work and the sending.

const TYPES = {
  training: 'Training',
  random: 'Random tournament',
  weighted: 'Weighted tournament',
  knockout: 'Knockout tournament',
};

// Whether an event's reminder should go out now: its moment (chosen when the event was planned,
// see alpha/js/reminder.js) has come, it wasn't sent yet, and the event is still ahead.
export function reminderDue(event, now) {
  return event.status !== 'cancelled' && !event.reminded && Boolean(event.remindAt)
    && event.remindAt <= now && event.startsAt > now;
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
