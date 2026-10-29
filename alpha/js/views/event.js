// An event: when and where, are you coming (with a reason when not), who's coming, and for admins
// editing, cancelling and deleting.
import * as Club from '../club.js';
import { session } from '../session.js';
import { html, icon, avatar, choose, confirmSheet, attempt, toast, dayText } from '../ui.js';
import { clubScreen } from './clubview.js';
import { answerButtons, wireAnswers, dayName, eventName, plural, NO_PLAYER } from './common.js';

export function show(el, [clubId, eventId], { go }) {
  let event; // undefined: loading; null: gone
  let regs = {};
  let stopEvent = null;
  let closed = false;
  let view = null;
  let note = null; // the reason being typed, kept across redraws
  let waiting = false;

  function draw(v) {
    view = v;
    if (!stopEvent) follow();
    const back = [`#/club/${clubId}`, v.club.name];
    if (event === undefined) { el.innerHTML = html`<div class="page">${top(back)}</div>`.s; return; }
    if (event === null) {
      el.innerHTML = html`<div class="page">${top(back)}<div class="card"><p class="empty">This event no longer exists.</p></div></div>`.s;
      return;
    }
    const e = event;
    const { admin, players, myPlayer } = v;
    const cancelled = e.status === 'cancelled';
    const mine = myPlayer ? regs[myPlayer.id] : null;
    const byName = (a, b) => a.name.localeCompare(b.name);
    const going = players.filter((p) => regs[p.id]?.status === 'going').sort(byName);
    const notGoing = players.filter((p) => regs[p.id]?.status === 'not going').sort(byName);
    const noAnswer = players.filter((p) => !regs[p.id]).sort(byName);
    const at = e.remindAt?.toDate();
    const person = (p) => html`<button type="button" class="row" data-player="${p.id}" ${admin && !cancelled ? '' : 'disabled style="cursor:default"'}>
        ${avatar(p.name, p.id === myPlayer?.id ? 'me' : '')}<span class="grow"><strong>${p.name}${p.id === myPlayer?.id ? html` <span class="muted" style="font-weight:400">you</span>` : ''}</strong>
        ${regs[p.id]?.note ? html`<small>${regs[p.id].note}</small>` : ''}</span></button>`;
    if (mine?.status !== 'not going') note = null;
    else if (note === null) note = mine.note ?? '';

    el.innerHTML = html`<div class="page">
      ${top(back, admin && !cancelled ? html`<a class="round" href="#/club/${clubId}/event/${eventId}/edit" aria-label="Edit">${icon('pencil', 18)}</a>` : '')}
      <div>
        <p class="sub" style="margin:0 4px 6px">${eventName(e)} · ${dayName(e.date, true)}</p>
        <div class="display" style="font-size:64px;line-height:1;margin:0 2px"><span class="cap">${e.start}</span></div>
        <p class="sub">until ${e.end}</p>
        ${cancelled ? html`<p class="chip notgoing" style="display:inline-block;margin:10px 4px 0">Cancelled</p>` : ''}
      </div>
      <div class="card">
        ${e.location ? html`<a class="row" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}" target="_blank" rel="noopener">${icon('pin', 20)}<span class="grow">${e.location}</span><span class="val">Maps</span></a>` : ''}
        <div class="row">${icon('courts', 20)}<span class="grow">${plural(e.courts, 'court')}</span></div>
        ${cancelled ? '' : html`<div class="row">${icon('bell', 20)}<span class="grow">${at ? `Reminder ${at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${at.toTimeString().slice(0, 5)}` : 'No reminder'}</span></div>`}
        ${e.seriesId ? html`<div class="row">${icon('calendar', 20)}<span class="grow">Every ${new Date(`${e.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}</span></div>` : ''}
      </div>
      ${cancelled ? '' : html`<section><h2 class="h3">Are you coming?</h2>
        ${answerButtons(mine?.status, myPlayer ? '' : NO_PLAYER)}
        ${mine?.status === 'not going' ? html`<label class="field" style="margin-top:12px">Reason, visible to the club (optional)
          <input type="text" data-note maxlength="140" value="${note ?? ''}" placeholder="e.g. Away this week"></label>` : ''}
      </section>`}
      <section><h2 class="h3">Going · ${going.length}</h2><div class="card">${going.length ? going.map(person) : html`<p class="empty">Nobody yet.</p>`}</div></section>
      ${notGoing.length ? html`<section><h2 class="h3">Not going · ${notGoing.length}</h2><div class="card">${notGoing.map(person)}</div></section>` : ''}
      ${noAnswer.length ? html`<section><h2 class="h3">No answer yet · ${noAnswer.length}</h2><div class="card">${noAnswer.map(person)}</div>
        <p class="note">${at && !e.reminded ? 'They get the reminder.' : ''}${admin && !cancelled ? ' Tap someone to answer for them.' : ''}</p></section>` : ''}
      ${admin ? html`<section><h2 class="h3">Manage</h2><div class="card">
        <button type="button" class="row" data-toggle>${cancelled ? 'Plan this date again' : 'Cancel this date'}</button>
        <button type="button" class="row danger" data-delete>${e.seriesId ? 'Delete only this date' : 'Delete this event'}</button>
        ${e.seriesId ? html`<button type="button" class="row danger" data-delete-series>Delete this and all later dates</button>` : ''}
      </div></section>` : ''}
    </div>`.s;

    if (myPlayer && !cancelled) {
      wireAnswers(el, { clubId, eventId, playerId: myPlayer.id, current: () => regs[myPlayer.id]?.status, note: () => note ?? '' });
    }
    const input = el.querySelector('[data-note]');
    input?.addEventListener('input', () => { note = input.value; });
    // The reason is saved when you leave the field (or press Enter).
    input?.addEventListener('change', saveNote);
    input?.addEventListener('blur', () => { if (waiting) { waiting = false; screen.redraw(); } });
    input?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } });
    el.querySelectorAll('[data-player]').forEach((b) => b.addEventListener('click', () => answerFor(players.find((p) => p.id === b.dataset.player))));
    el.querySelector('[data-toggle]')?.addEventListener('click', toggleCancelled);
    el.querySelector('[data-delete]')?.addEventListener('click', deleteOne);
    el.querySelector('[data-delete-series]')?.addEventListener('click', deleteSeries);
  }

  const top = ([href, label], right = '') => html`<div class="top"><a class="back" href="${href}">${icon('back', 22)}${label}</a>${right}</div>`;

  function saveNote() {
    const p = view?.myPlayer;
    if (!p || regs[p.id]?.status !== 'not going') return;
    const text = (note ?? '').trim();
    if (text === (regs[p.id].note ?? '')) return;
    attempt(Club.register(session.user, clubId, eventId, p.id, 'not going', text), 'Couldn’t save the reason');
  }

  async function answerFor(p) {
    if (!p || !view.admin) return;
    const answer = await choose(p.name, 'Answer for this player:', [
      { label: 'Going', value: 'going', style: 'primary' },
      { label: 'Not going', value: 'not going' },
      { label: 'No answer', value: 'none' },
    ]);
    if (!answer) return;
    attempt(Club.register(session.user, clubId, eventId, p.id, answer === 'none' ? null : answer), 'Couldn’t save');
  }

  async function toggleCancelled() {
    const cancelled = event.status === 'cancelled';
    if (!cancelled && !(await confirmSheet('Cancel this date?', 'Everyone sees it as cancelled. You can plan it again later.', 'Cancel this date', true))) return;
    if (await attempt(Club.setEventStatus(clubId, eventId, cancelled ? 'planned' : 'cancelled'), 'Couldn’t change the event')) {
      toast(cancelled ? 'Planned again' : 'Date cancelled');
    }
  }

  async function deleteOne() {
    if (!(await confirmSheet('Delete this date?', 'With everyone’s answers.', 'Delete', true))) return;
    stopEvent?.();
    if (await attempt(Club.deleteEvent(clubId, eventId), 'Couldn’t delete the event')) go(`#/club/${clubId}`, { replace: true });
  }

  async function deleteSeries() {
    if (!(await confirmSheet('Delete this and all later dates?', `Every ${dayText(event.date, { weekday: 'long' })} from ${dayText(event.date)} on. Earlier dates stay.`, 'Delete', true))) return;
    stopEvent?.();
    if (await attempt(Club.deleteSeries(clubId, event.seriesId, event.date), 'Couldn’t delete the dates')) go(`#/club/${clubId}`, { replace: true });
  }

  async function follow() {
    stopEvent = () => {};
    const stop = await Club.watchEvent(clubId, eventId, (s) => {
      event = s.event;
      regs = s.registrations;
      // Don't redraw under someone typing their reason; catch up when they leave the field.
      if (document.activeElement?.matches?.('[data-note]')) waiting = true;
      else screen.redraw();
    });
    if (closed) stop();
    else stopEvent = stop;
  }

  const screen = clubScreen(el, clubId, draw);
  return () => { closed = true; saveNote(); screen.cleanup(); stopEvent?.(); };
}
