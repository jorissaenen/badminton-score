// Events: the Upcoming list and "Plan an event" in the Club window, the Event window (are you
// coming, who's coming), and the next event in settings.
import * as Club from './club.js';
import { choiceFor, describeReminder, remindAt, reminderChoices } from './reminder.js';

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

const dayText = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const longDayText = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const isToday = (iso) => iso === Club.isoDate(new Date());

function whenText(e, long = false) {
  return `${isToday(e.date) ? 'Today' : long ? longDayText(e.date) : dayText(e.date)}, ${e.start}–${e.end}`;
}

function chip(status) {
  if (status === 'going') return el('span', { className: 'chip going' }, 'Going');
  if (status === 'not going') return el('span', { className: 'chip not-going' }, 'Not going');
  return el('span', { className: 'chip' }, '?');
}

// ctx: { user(), notify(text), club() → the open Club window's view: { id, myRole, players, seasons } }
export function setupEvents($, ctx) {
  let events = [];
  let registrations = {}; // eventId → { playerId → registration }
  let stopList = null;
  let stopRegs = null;
  const status = (text) => { $('clubDialogStatus').textContent = text; };

  const myPlayerId = () => ctx.club()?.players.find((p) => p.uid === ctx.user()?.uid)?.id ?? null;

  // ---------- the Upcoming list in the Club window ----------

  async function watch(clubId) {
    stop();
    stopList = await Club.watchUpcoming(clubId, async (list) => {
      events = list;
      render();
      stopRegs?.();
      stopRegs = await Club.watchRegistrations(clubId, list.slice(0, 8).map((e) => e.id), (all) => {
        registrations = all;
        render();
      });
    });
  }

  function stop() {
    stopList?.();
    stopRegs?.();
    stopList = stopRegs = null;
    events = [];
    registrations = {};
  }

  function render() {
    const view = ctx.club();
    if (!view) return;
    const admin = Club.isAdmin(view.myRole);
    const mine = myPlayerId();
    $('noEvents').hidden = events.length > 0;
    $('eventAddBtn').hidden = !admin;
    $('eventList').replaceChildren(...events.map((e) => {
      const regs = registrations[e.id];
      const going = regs ? Object.values(regs).filter((r) => r.status === 'going').length : null;
      const details = [Club.EVENT_TYPES[e.type], e.location, going != null ? `${going} going` : null].filter(Boolean).join(' · ');
      return el('li', { onclick: () => openEvent(view.id, e.id) },
        el('span', { className: 'who two-line' }, el('strong', {}, whenText(e)), el('small', {}, details)),
        e.status === 'cancelled' ? el('span', { className: 'chip cancelled' }, 'Cancelled')
          : mine && regs ? chip(regs[mine]?.status) : null);
    }));
  }

  // ---------- planning and editing an event (admins) ----------

  const editDialog = $('eventEditDialog');
  let editing = null; // null: planning a new event; otherwise the event being edited
  const fstatus = (text) => { $('eventEditStatus').textContent = text; };

  // The reminder list shows the actual moments, so it follows the date and start time.
  function fillReminderChoices(keep = $('eventReminder').value || 'smart') {
    const date = $('eventDate').value || Club.isoDate(new Date());
    const start = $('eventStart').value || '20:00';
    const choices = reminderChoices(date, start);
    $('eventReminder').replaceChildren(...Object.entries(choices).map(([value, c]) => el('option', { value }, c.label)));
    $('eventReminder').value = keep in choices ? keep : 'smart';
    showReminderWhen();
  }

  function showReminderWhen() {
    $('reminderOther').hidden = $('eventReminder').value !== 'other';
    $('reminderWhen').textContent = $('eventDate').value ? describeReminder($('eventDate').value, chosenReminder()) : '';
  }

  function chosenReminder() {
    const key = $('eventReminder').value;
    if (key === 'none') return null;
    if (key === 'other') return { daysBefore: Number($('reminderDays').value), time: $('reminderTime').value || '09:00' };
    return reminderChoices($('eventDate').value, $('eventStart').value)[key].reminder;
  }

  function openEditor(event = null) {
    editing = event;
    const view = ctx.club();
    $('eventEditTitle').textContent = event ? 'Edit event' : 'Plan an event';
    $('eventSaveBtn').textContent = event ? 'Save' : 'Plan';
    $('eventRepeatField').hidden = Boolean(event);
    $('eventUntilField').hidden = true;
    $('eventRepeat').value = '';
    $('eventType').value = event?.type ?? 'training';
    $('eventDate').value = event?.date ?? Club.isoDate(new Date());
    $('eventStart').value = event?.start ?? '20:00';
    $('eventEnd').value = event?.end ?? '21:30';
    $('eventCourts').value = event?.courts ?? 2;
    $('eventLocation').value = event?.location ?? '';
    const season = view && Club.currentSeason(view.seasons);
    $('eventUntil').value = season?.end ?? Club.isoDate(new Date(Date.now() + 90 * 86400_000));
    const choice = event ? choiceFor(event.reminder, event.date, event.start) : 'smart';
    if (choice === 'other') {
      $('reminderDays').value = String(event.reminder.daysBefore);
      $('reminderTime').value = event.reminder.time;
    }
    fillReminderChoices(choice);
    fstatus('');
    editDialog.showModal();
  }

  $('eventAddBtn').addEventListener('click', () => openEditor());
  $('eventEditCancel').addEventListener('click', () => editDialog.close());
  $('eventRepeat').addEventListener('change', () => {
    $('eventUntilField').hidden = $('eventRepeat').value !== 'weekly';
  });
  $('eventDate').addEventListener('change', () => fillReminderChoices());
  $('eventStart').addEventListener('change', () => fillReminderChoices());
  $('eventReminder').addEventListener('change', showReminderWhen);
  $('reminderDays').addEventListener('change', showReminderWhen);
  $('reminderTime').addEventListener('change', showReminderWhen);

  // Asks whether a change to a date of a weekly series is for that date only or for all upcoming
  // dates. Resolves to 'one', 'all', or null (cancelled).
  function askScope() {
    const d = $('scopeDialog');
    return new Promise((resolve) => {
      const done = (answer) => {
        d.close();
        resolve(answer);
      };
      $('scopeOne').onclick = () => done('one');
      $('scopeAll').onclick = () => done('all');
      $('scopeCancel').onclick = () => done(null);
      d.oncancel = () => resolve(null);
      d.showModal();
    });
  }

  $('eventSaveBtn').addEventListener('click', async () => {
    const view = ctx.club();
    const e = {
      type: $('eventType').value,
      date: $('eventDate').value,
      start: $('eventStart').value,
      end: $('eventEnd').value,
      courts: Number($('eventCourts').value) || 1,
      location: $('eventLocation').value.trim(),
      reminder: chosenReminder(),
    };
    const until = !editing && $('eventRepeat').value === 'weekly' ? $('eventUntil').value : null;
    if (!e.date || !e.start || !e.end) {
      fstatus('Fill in the date and the times.');
      return;
    }
    if (e.end <= e.start) {
      fstatus('The event has to end after it starts.');
      return;
    }
    if (!editing && $('eventRepeat').value === 'weekly' && (!until || until < e.date)) {
      fstatus('Pick until when the event repeats (after the first date).');
      return;
    }
    const at = remindAt(e.date, e.reminder);
    if (at && at >= Club.startsAt(e.date, e.start)) {
      fstatus('The reminder has to come before the event starts.');
      return;
    }
    if (editing && !Club.changedFields(editing, e).length) {
      editDialog.close();
      return;
    }
    const scope = editing?.seriesId ? await askScope() : 'one';
    if (!scope) return;
    $('eventSaveBtn').disabled = true;
    try {
      if (!editing) {
        const n = await Club.addEvents(ctx.user(), view.id, e, until);
        ctx.notify(n === 1 ? 'Event planned' : `${n} dates planned`);
      } else if (scope === 'all') {
        const n = await Club.updateSeries(editClub, editing, e);
        ctx.notify(`${n} date${n === 1 ? '' : 's'} changed`);
      } else {
        await Club.updateEvent(editClub, editing, e);
        ctx.notify('Event changed');
      }
      editDialog.close();
    } catch (err) {
      fstatus(`Couldn’t save (${err.code || err.message}).`);
    } finally {
      $('eventSaveBtn').disabled = false;
    }
  });

  // ---------- the Event window ----------

  const dialog = $('eventDialog');
  let open = null; // { clubId, eventId, event, registrations, players, myRole, playerId }
  let stopEvent = null;
  const estatus = (text) => { $('eventStatus').textContent = text; };

  async function act(promise, failure) {
    try {
      await promise;
      estatus('');
    } catch (e) {
      estatus(`${failure} (${e.code || e.message}).`);
    }
  }

  // Opens an event; from the Club window (players known) or from settings / a reminder.
  async function openEvent(clubId, eventId) {
    const user = ctx.user();
    if (!user) return;
    stopEvent?.();
    const view = ctx.club()?.id === clubId ? ctx.club() : null;
    open = {
      clubId, eventId, event: null, registrations: {},
      players: view?.players ?? null,
      myRole: view?.myRole ?? await Club.myRoleIn(user, clubId),
    };
    if (!open.players) open.players = await Club.listPlayers(clubId).catch(() => []);
    open.playerId = open.players.find((p) => p.uid === user.uid)?.id ?? null;
    $('answerNote').value = '';
    estatus('');
    stopEvent = await Club.watchEvent(clubId, eventId, (state) => {
      open.event = state.event;
      open.registrations = state.registrations;
      renderEvent();
    });
    if (!dialog.open) dialog.showModal();
  }

  dialog.addEventListener('close', () => {
    stopEvent?.();
    stopEvent = null;
    open = null;
    refreshNext();
  });

  function renderEvent() {
    const { event: e, registrations: regs, players, playerId, myRole } = open;
    if (!e) {
      $('eventTitle').textContent = 'Event';
      $('eventWhen').textContent = 'This event no longer exists.';
      return;
    }
    const admin = Club.isAdmin(myRole);
    const cancelled = e.status === 'cancelled';
    $('eventTitle').textContent = Club.EVENT_TYPES[e.type] ?? 'Event';
    $('eventWhen').textContent = [whenText(e, true), e.location, `${e.courts} court${e.courts === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    $('eventCancelled').hidden = !cancelled;

    // My answer
    const mine = playerId ? regs[playerId] : null;
    $('myAnswerGroup').hidden = cancelled;
    $('goingBtn').className = `btn outline${mine?.status === 'going' ? ' on-going' : ''}`;
    $('notGoingBtn').className = `btn outline${mine?.status === 'not going' ? ' on-not-going' : ''}`;
    $('goingBtn').disabled = $('notGoingBtn').disabled = !playerId;
    $('answerNoteField').hidden = mine?.status !== 'not going';
    if (mine?.status === 'not going' && document.activeElement !== $('answerNote')) $('answerNote').value = mine.note ?? '';
    $('answerHint').textContent = playerId ? ''
      : 'To answer, first link yourself to a player: Club → Players → That’s me, or Add me as a player.';

    // Who's coming
    const byName = (a, b) => a.name.localeCompare(b.name);
    const going = players.filter((p) => regs[p.id]?.status === 'going').sort(byName);
    const notGoing = players.filter((p) => regs[p.id]?.status === 'not going').sort(byName);
    const noAnswer = players.filter((p) => !regs[p.id]).sort(byName);
    $('goingTitle').textContent = `Going (${going.length})`;
    $('notGoingTitle').textContent = `Not going (${notGoing.length})`;
    $('noAnswerTitle').textContent = `No answer yet (${noAnswer.length})`;
    $('goingNone').hidden = going.length > 0;
    $('notGoingGroup').hidden = !notGoing.length;
    $('noAnswerGroup').hidden = !noAnswer.length;
    const row = (p) => {
      const r = regs[p.id];
      const answer = admin && !cancelled ? el('select', {
        ariaLabel: `Answer for ${p.name}`,
        onchange: (ev) => act(Club.register(ctx.user(), open.clubId, open.eventId, p.id, ev.target.value), 'Couldn’t save'),
      }, ...[['', '?'], ['going', 'Going'], ['not going', 'Not going']]
        .map(([v, t]) => el('option', { value: v, selected: (r?.status ?? '') === v }, t))) : null;
      return el('li', {},
        el('span', { className: 'who' }, p.name,
          p.id === playerId ? el('small', {}, 'you') : null,
          r?.note ? el('span', { className: 'reason' }, r.note) : null),
        answer);
    };
    $('goingList').replaceChildren(...going.map(row));
    $('notGoingList').replaceChildren(...notGoing.map(row));
    $('noAnswerList').replaceChildren(...noAnswer.map(row));

    // Reminder and editing
    const at = e.remindAt?.toDate();
    $('eventReminderText').textContent = cancelled ? ''
      : at ? `Reminder: ${at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${at.toTimeString().slice(0, 5)}`
        : 'No reminder';
    $('eventEditBtn').hidden = !admin;

    // Manage
    $('eventAdmin').hidden = !admin;
    $('eventToggleBtn').textContent = cancelled ? 'Plan this date again' : 'Cancel this date';
    $('seriesDeleteBtn').hidden = !e.seriesId;
    $('eventDeleteBtn').textContent = e.seriesId ? 'Delete only this date' : 'Delete this event';
  }

  async function answer(statusValue) {
    if (!open?.playerId) return;
    const current = open.registrations[open.playerId]?.status;
    const next = current === statusValue ? null : statusValue; // tapping your answer again clears it
    await act(Club.register(ctx.user(), open.clubId, open.eventId, open.playerId, next,
      next === 'not going' ? $('answerNote').value.trim() : ''), 'Couldn’t save your answer');
    if (next === 'not going') $('answerNote').focus();
  }
  $('goingBtn').addEventListener('click', () => answer('going'));
  $('notGoingBtn').addEventListener('click', () => answer('not going'));

  // The reason is saved when you leave the field (or press Enter).
  function saveNote() {
    if (!open?.playerId || open.registrations[open.playerId]?.status !== 'not going') return;
    const note = $('answerNote').value.trim();
    if (note === (open.registrations[open.playerId].note ?? '')) return;
    act(Club.register(ctx.user(), open.clubId, open.eventId, open.playerId, 'not going', note), 'Couldn’t save the reason');
  }
  $('answerNote').addEventListener('change', saveNote);
  $('answerNote').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter would otherwise close the window
    saveNote();
    $('answerNote').blur();
  });

  let editClub = null; // the club of the event being edited
  $('eventEditBtn').addEventListener('click', () => {
    editClub = open.clubId;
    openEditor({ ...open.event });
  });

  $('eventToggleBtn').addEventListener('click', () => {
    const cancelled = open.event.status === 'cancelled';
    if (!cancelled && !confirm('Cancel this date? Everyone sees it as cancelled.')) return;
    act(Club.setEventStatus(open.clubId, open.eventId, cancelled ? 'planned' : 'cancelled'), 'Couldn’t change the event');
  });

  $('eventDeleteBtn').addEventListener('click', async () => {
    if (!confirm('Delete this date, with everyone’s answers?')) return;
    const { clubId, eventId } = open;
    stopEvent?.();
    await act(Club.deleteEvent(clubId, eventId), 'Couldn’t delete the event');
    dialog.close();
  });

  $('seriesDeleteBtn').addEventListener('click', async () => {
    const { clubId, event: e } = open;
    if (!confirm(`Delete this date and every later date of this weekly event? Earlier dates stay.`)) return;
    stopEvent?.();
    await act(Club.deleteSeries(clubId, e.seriesId, e.date), 'Couldn’t delete the dates');
    dialog.close();
  });

  // ---------- the next event, in settings ----------

  let nextFor = null;
  let nextRun = 0; // only the latest refresh may change the line
  async function refreshNext(clubId = nextFor) {
    nextFor = clubId;
    const run = ++nextRun;
    const button = $('nextEvent');
    const user = ctx.user();
    if (!clubId || !user) {
      button.hidden = true;
      return;
    }
    try {
      const e = await Club.nextEvent(clubId);
      if (run !== nextRun) return;
      if (!e) {
        button.hidden = true;
        return;
      }
      const player = await Club.myPlayer(user, clubId);
      const r = player ? await Club.myRegistration(clubId, e.id, player.id) : null;
      if (run !== nextRun) return;
      const you = !player ? '' : r?.status === 'going' ? ' · you’re going'
        : r?.status === 'not going' ? ' · you’re not going' : ' · are you coming?';
      button.replaceChildren(el('strong', {}, `Next: ${Club.EVENT_TYPES[e.type]}`),
        el('small', {}, `${whenText(e)}${e.location ? ` · ${e.location}` : ''}${you}`));
      button.onclick = () => openEvent(clubId, e.id);
      button.hidden = false;
    } catch {
      button.hidden = true;
    }
  }

  return { watch, stop, render, openEvent, refreshNext };
}
