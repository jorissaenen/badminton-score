// An event: when and where, are you coming (with a reason when not), who's coming, and for admins
// editing, cancelling and deleting.
import * as Club from '../club.js';
import { session } from '../session.js';
import { html, icon, choose, confirmSheet, attempt, toast, dayText, raw, sheet } from '../ui.js';
import { t, locale } from '../i18n.js';
import * as M from '../match.js';
import { sportOf } from '../sports.js';
import { eventStats } from '../stats.js';
import { state, isFinished } from '../state.js';
import { sportName, rulesSummary } from './rules.js';
import { canLinkScreens, screensSection, wireScreens } from './screens.js';
import { clubScreen } from './clubview.js';
import { answerButtons, wireAnswers, dayName, eventName, noPlayer, face, roleKey } from './common.js';

export function show(el, [clubId, eventId], { go }) {
  let event; // undefined: loading; null: gone
  let regs = {};
  let stopEvent = null;
  let closed = false;
  let view = null;
  let note = null; // the reason being typed, kept across redraws
  let waiting = false;
  let matches = [];
  let stopMatches = null;
  let screens = [];
  let stopScreens = null;
  let pinned = null; // the pinned message being typed

  function draw(v) {
    view = v;
    if (!stopEvent) follow();
    const back = [`#/club/${clubId}`, v.club.name];
    if (event === undefined) { el.innerHTML = html`<div class="page">${top(back)}</div>`.s; return; }
    if (event === null) {
      el.innerHTML = html`<div class="page">${top(back)}<div class="card"><p class="empty">${t('event.gone')}</p></div></div>`.s;
      return;
    }
    const e = event;
    const { admin, players, myPlayer } = v;
    const cancelled = e.status === 'cancelled';
    const phase = Club.eventPhase(e, Date.now(), matches); // upcoming, live (also while the last matches go on), ended
    const mine = myPlayer ? regs[myPlayer.id] : null;
    const byName = (a, b) => a.name.localeCompare(b.name);
    const going = players.filter((p) => regs[p.id]?.status === 'going').sort(byName);
    const notGoing = players.filter((p) => regs[p.id]?.status === 'not going').sort(byName);
    const noAnswer = players.filter((p) => !regs[p.id]).sort(byName);
    const at = e.remindAt?.toDate();
    // While it's on (and after), who's here instead of who's coming; score keepers mark that too.
    const during = phase === 'live' || phase === 'ended';
    const canMark = !cancelled && (admin || (during && Club.isKeeper(v.myRole)));
    const person = (p) => html`<button type="button" class="row" data-player="${p.id}" ${canMark ? '' : raw('disabled style="cursor:default"')}>
        ${face(v, p, p.id === myPlayer?.id ? 'me' : '')}<span class="grow"><strong>${p.name}${p.id === myPlayer?.id ? html` <span class="muted" style="font-weight:400">${t('common.you')}</span>` : ''}</strong>
        ${regs[p.id]?.note ? html`<small>${regs[p.id].note}</small>` : ''}</span></button>`;
    if (mine?.status !== 'not going') note = null;
    else if (note === null) note = mine.note ?? '';

    el.innerHTML = html`<div class="page">
      ${top(back, admin && !cancelled ? html`<a class="round" href="#/club/${clubId}/event/${eventId}/edit" aria-label="${t('common.edit')}">${icon('pencil', 18)}</a>` : '')}
      <div>
        <p class="sub" style="margin:0 4px 6px">${eventName(e)} · ${dayName(e.date, true)}</p>
        <div class="display" style="font-size:64px;line-height:1;margin:0 2px"><span class="cap">${e.start}</span></div>
        <p class="sub">${t('event.until', { end: e.end })}</p>
        ${cancelled ? html`<p class="chip notgoing" style="display:inline-block;margin:10px 4px 0">${t('event.cancelled')}</p>` : ''}
        ${phase === 'live' ? html`<p class="chip live" style="display:inline-flex;margin:10px 4px 0">${t('event.live')}</p>` : ''}
        ${phase === 'ended' ? html`<p class="chip" style="display:inline-block;margin:10px 4px 0">${t('event.ended')}</p>` : ''}
      </div>
      ${phase === 'live' || phase === 'ended' ? playing(v) : ''}
      ${canLinkScreens(v.myRole) && (phase === 'live' || phase === 'upcoming') ? screensSection(screens, v.club.sport ?? 'badminton') : ''}
      ${admin && (phase === 'live' || phase === 'upcoming') ? html`<section><h2 class="h3">${t('screen.pinned')}</h2>
        <div class="inline"><input type="text" data-pinned maxlength="280" value="${pinned ?? e.pinned ?? ''}" placeholder="${t('screen.pinnedExample')}" style="margin:0">
        <button type="button" class="btn small primary" data-save-pinned>${t('common.save')}</button></div>
        <p class="note">${t('screen.pinnedNote')}</p></section>` : ''}
      <div class="card">
        ${e.location ? html`<a class="row" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}" target="_blank" rel="noopener">${icon('pin', 20)}<span class="grow">${e.location}</span><span class="val">${t('event.maps')}</span></a>` : ''}
        <div class="row">${icon('courts', 20)}<span class="grow">${t('event.nCourts', { n: e.courts })}</span></div>
        ${cancelled ? '' : html`<div class="row">${icon('bell', 20)}<span class="grow">${at ? t('event.reminderAt', { day: at.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }), time: at.toTimeString().slice(0, 5) }) : t('reminder.none')}</span></div>`}
        ${e.seriesId ? html`<div class="row">${icon('calendar', 20)}<span class="grow">${t('event.everyWeekday', { day: dayText(e.date, { weekday: 'long' }) })}</span></div>` : ''}
      </div>
      ${phase !== 'upcoming' ? '' : html`<section><h2 class="h3">${t('event.coming')}</h2>
        ${answerButtons(mine?.status, myPlayer ? '' : noPlayer())}
        ${mine?.status === 'not going' ? html`<label class="field" style="margin-top:12px">${t('event.reason')}
          <input type="text" data-note maxlength="140" value="${note ?? ''}" placeholder="${t('event.reasonExample')}"></label>` : ''}
      </section>`}
      <section><h2 class="h3">${t(phase === 'upcoming' ? 'event.goingN' : 'event.hereN', { n: going.length })}</h2><div class="card">${going.length ? going.map(person) : html`<p class="empty">${t('event.nobodyYet')}</p>`}</div>${roleKey()}
        ${during && canMark ? html`<p class="note">${t('event.tapToMark')}</p>` : ''}</section>
      ${notGoing.length ? html`<section><h2 class="h3">${t(during ? 'event.notHereN' : 'event.notGoingN', { n: notGoing.length })}</h2><div class="card">${notGoing.map(person)}</div></section>` : ''}
      ${noAnswer.length ? html`<section><h2 class="h3">${t(during ? 'event.notMarkedN' : 'event.noAnswerN', { n: noAnswer.length })}</h2><div class="card">${noAnswer.map(person)}</div>
        <p class="note">${during ? '' : [at && !e.reminded ? t('event.theyGetReminder') : '', canMark ? t('event.tapToAnswer') : ''].filter(Boolean).join(' ')}</p></section>` : ''}
      ${admin ? html`<section><h2 class="h3">${t('event.manage')}</h2><div class="card">
        <button type="button" class="row" data-toggle>${cancelled ? t('event.planAgain') : t('event.cancelDate')}</button>
        <button type="button" class="row danger" data-delete>${e.seriesId ? t('event.deleteOnlyDate') : t('event.deleteEvent')}</button>
        ${e.seriesId ? html`<button type="button" class="row danger" data-delete-series>${t('event.deleteLater')}</button>` : ''}
      </div></section>` : ''}
    </div>`.s;

    wireScreens(el, screens, { clubId, eventId, courts: e.courts, sport: v.club.sport ?? 'badminton' });
    const pin = el.querySelector('[data-pinned]');
    pin?.addEventListener('input', () => { pinned = pin.value; });
    el.querySelector('[data-save-pinned]')?.addEventListener('click', async () => {
      if (await attempt(Club.setPinned(clubId, eventId, (pinned ?? e.pinned ?? '').trim()), t('common.saveFailed'))) { pinned = null; toast(t('common.saved')); }
    });
    el.querySelector('[data-continue]')?.addEventListener('click', () => go('#/match'));
    el.querySelectorAll('[data-match]').forEach((b) => b.addEventListener('click', () => matchSheet(matches.find((m) => m.id === b.dataset.match))));
    if (myPlayer && phase === 'upcoming') {
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

  // During and after the event: start a match (while it's on), the matches played and being
  // played, and the statistics so far (final once the event has ended).
  function playing(v) {
    const live = Club.eventPhase(event, Date.now(), matches) === 'live';
    const mineHere = state.link?.eventId === eventId && !isFinished();
    const shown = matches.filter((m) => m.status !== 'stopped');
    const now = shown.filter((m) => m.status === 'live');
    const done = shown.filter((m) => m.status === 'finished').reverse();
    const stats = eventStats(matches);
    const row = (m) => {
      const scores = M.gameScores(m.state, m.rules);
      const result = m.status === 'live'
        ? `${M.display(m.state, m.rules).tiles.join('–')}${scores.length > 1 ? ` · ${t(sportOf(m.sport).scoring === 'tennis' ? 'play.setN' : 'play.gameN', { n: scores.length })}` : ''}`
        : scores.map((s) => s.join('–')).join('  ');
      const won = (side) => m.status === 'finished' && m.winner === side;
      return html`<button type="button" class="row" data-match="${m.id}">
        <span class="grow"><strong ${won(0) ? '' : raw('style="font-weight:500"')}>${m.home.map((p) => p.name).join(' & ')}</strong>
          <strong ${won(1) ? '' : raw('style="font-weight:500"')}>${m.away.map((p) => p.name).join(' & ')}</strong></span>
        <span class="val display" style="font-size:20px;white-space:nowrap">${result}</span>
        ${m.status === 'live' ? html`<span class="chip live">${t('event.liveShort')}</span>` : ''}</button>`;
    };
    return html`
      ${live ? html`<div class="btns">${mineHere ? html`<button type="button" class="btn primary" data-continue>${t('event.continueScoring')}</button>`
        : html`<a class="btn primary" href="#/club/${clubId}/event/${eventId}/match">${icon('plus', 20)}${t('event.startMatch')}</a>`}</div>` : ''}
      <section><h2 class="h3">${t('event.matchesN', { n: shown.length })}</h2><div class="card">
        ${shown.length ? [...now, ...done].map(row) : html`<p class="empty">${live ? t('event.noMatchesYet') : t('event.noMatches')}</p>`}</div></section>
      ${stats.length ? html`<section><h2 class="h3">${live ? t('event.statsSoFar') : t('event.stats')}</h2><div class="card">
        <div class="row muted" style="min-height:0;font-size:12px;font-weight:600;letter-spacing:.06em">
          <span class="grow"></span><span class="stat">${t('stats.played')}</span><span class="stat">${t('stats.won')}</span><span class="stat">${t('stats.diff')}</span></div>
        ${stats.map((r, i) => html`<div class="row" style="min-height:48px"><span class="muted display" style="width:22px">${i + 1}</span>${face(v, r, r.id && r.id === v.myPlayer?.id ? 'me' : '')}
          <span class="grow"><strong>${r.name}</strong></span>
          <span class="stat">${r.played}</span><span class="stat"><b>${r.won}</b></span><span class="stat">${r.for - r.against > 0 ? '+' : ''}${r.for - r.against}</span></div>`)}
      </div><p class="note">${t('event.statsNote')}</p></section>` : ''}`;
  }

  // A match's details: every game, and for the keeper or an admin, removing it.
  function matchSheet(m) {
    if (!m) return;
    const canRemove = view.admin || (m.keeper === session.user?.uid && m.status !== 'finished');
    const scores = M.gameScores(m.state, m.rules);
    sheet(html`<h2 class="sheet-title">${m.home.map((p) => p.name).join(' & ')} – ${m.away.map((p) => p.name).join(' & ')}</h2>
      <p class="sheet-text">${sportName(m.sport)} · ${rulesSummary(m.rules)}${m.status === 'live' ? ` · ${t('event.liveShort')}` : ''}</p>
      <div class="card">${scores.map((s, i) => html`<div class="row"><span class="grow">${t(sportOf(m.sport).scoring === 'tennis' ? 'board.setN' : 'board.gameN', { n: i + 1 })}</span><span class="display" style="font-size:22px">${s.join('–')}</span></div>`)}</div>
      ${canRemove ? html`<button type="button" class="btn danger block" data-remove-match>${t('event.removeMatch')}</button>` : ''}`.s, (sh, close) => {
      sh.querySelector('[data-remove-match]')?.addEventListener('click', async () => {
        close();
        if (await confirmSheet(t('event.removeMatchQ'), t('event.removeMatchText'), t('common.remove'), true)) attempt(Club.deleteMatch(clubId, m.id), t('common.saveFailed'));
      });
    });
  }

  const top = ([href, label], right = '') => html`<div class="top"><a class="back" href="${href}">${icon('back', 22)}${label}</a>${right}</div>`;

  function saveNote() {
    const p = view?.myPlayer;
    if (!p || regs[p.id]?.status !== 'not going') return;
    const text = (note ?? '').trim();
    if (text === (regs[p.id].note ?? '')) return;
    attempt(Club.register(session.user, clubId, eventId, p.id, 'not going', text), t('event.reasonFailed'));
  }

  async function answerFor(p) {
    const during = ['live', 'ended'].includes(Club.eventPhase(event, Date.now(), matches));
    if (!p || !(view.admin || (during && Club.isKeeper(view.myRole)))) return;
    const answer = await choose(p.name, t(during ? 'event.markFor' : 'event.answerFor'), [
      { label: t(during ? 'answer.here' : 'answer.going'), value: 'going', style: 'primary' },
      { label: t(during ? 'answer.notHere' : 'answer.notGoing'), value: 'not going' },
      { label: t(during ? 'answer.notMarked' : 'answer.none'), value: 'none' },
    ]);
    if (!answer) return;
    attempt(Club.register(session.user, clubId, eventId, p.id, answer === 'none' ? null : answer), t('common.saveFailed'));
  }

  async function toggleCancelled() {
    const cancelled = event.status === 'cancelled';
    if (!cancelled && !(await confirmSheet(t('event.cancelQ'), t('event.cancelText'), t('event.cancelDate'), true))) return;
    if (await attempt(Club.setEventStatus(clubId, eventId, cancelled ? 'planned' : 'cancelled'), t('event.changeFailed'))) {
      toast(cancelled ? t('event.plannedAgain') : t('event.dateCancelled'));
    }
  }

  async function deleteOne() {
    if (!(await confirmSheet(t('event.deleteQ'), t('event.deleteText'), t('common.delete'), true))) return;
    stopEvent?.();
    if (await attempt(Club.deleteEvent(clubId, eventId), t('event.deleteFailed'))) go(`#/club/${clubId}`, { replace: true });
  }

  async function deleteSeries() {
    if (!(await confirmSheet(t('event.deleteLaterQ'), t('event.deleteLaterText', { weekday: dayText(event.date, { weekday: 'long' }), day: dayText(event.date) }), t('common.delete'), true))) return;
    stopEvent?.();
    if (await attempt(Club.deleteSeries(clubId, event.seriesId, event.date), t('event.deleteDatesFailed'))) go(`#/club/${clubId}`, { replace: true });
  }

  async function follow() {
    stopEvent = () => {};
    Club.watchEventMatches(clubId, eventId, (list) => {
      matches = list;
      if (!document.activeElement?.matches?.('[data-note]')) screen.redraw();
    }).then((stop) => { if (closed) stop(); else stopMatches = stop; });
    if (canLinkScreens(view?.myRole)) {
      Club.watchEventScreens(clubId, eventId, (list) => {
        screens = list;
        if (!document.activeElement?.matches?.('input')) screen.redraw();
      }).then((stop) => { if (closed) stop(); else stopScreens = stop; });
    }
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
  // Starts and ends on its own: redraw each minute while the screen is open.
  const tick = setInterval(() => { if (!document.activeElement?.matches?.('input')) screen.redraw(); }, 60_000);
  return () => { closed = true; saveNote(); screen.cleanup(); stopEvent?.(); stopMatches?.(); stopScreens?.(); clearInterval(tick); };
}
