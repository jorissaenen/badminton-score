// Play: the next event of your clubs (are you coming?) and the ways to start keeping score.
import * as M from '../match.js';
import * as Club from '../club.js';
import { session, onSession } from '../session.js';
import { state, hasStarted, isFinished, displayNames } from '../state.js';
import { html, icon, initials, raw } from '../ui.js';
import { t } from '../i18n.js';
import { sportOf, sportIcon } from '../sports.js';
import { EDITION } from '../edition.js';

// The next event as last shown, so Play draws it at once next time (top to bottom, no jumping)
// and then brings it up to date.
const NEXT_KEY = `${EDITION.storageKey}-next`;
function cachedNext(uid) {
  try {
    const c = JSON.parse(localStorage.getItem(NEXT_KEY));
    return c?.uid === uid && c.event?.date >= new Date().toISOString().slice(0, 10) ? c.next : null;
  } catch { return null; }
}
function cacheNext(uid, next) {
  try {
    if (!next) { localStorage.removeItem(NEXT_KEY); return; }
    const { club, event: e, player, registrations } = next;
    const event = { id: e.id, type: e.type, date: e.date, start: e.start, end: e.end, location: e.location ?? '' };
    const regs = Object.fromEntries(Object.entries(registrations ?? {}).map(([id, r]) => [id, { status: r.status }]));
    localStorage.setItem(NEXT_KEY, JSON.stringify({ uid, event, next: { club: { id: club.id, name: club.name }, event, player: player ? { id: player.id } : null, registrations: registrations ? regs : null } }));
  } catch { /* only affects how fast Play shows the event */ }
}
import { answerButtons, wireAnswers, counts, dayName, eventName, nextOfAllClubs, noPlayer } from './common.js';

export function show(el, _params, { go }) {
  let next = null; // { club, event, player, registrations }
  let loading = false; // the next event is being looked up: keep its place
  let stopEvent = null;
  let run = 0;

  function draw() {
    const u = session.user;
    const name = u?.displayName || u?.email || '';
    el.innerHTML = html`<div class="page">
      <div class="home-top">
        <img class="logo" src="icons/skoor-logo.svg" alt="Skoor">
        <a href="#/you" aria-label="${t('tab.you')}">${u ? html`<span class="av me">${initials(name)}</span>` : html`<span class="av">${icon('you', 18)}</span>`}</a>
      </div>
      ${next ? eventCard() : loading ? html`<div class="event-card skeleton" aria-hidden="true"></div>` : ''}
      <section>
        <h2 class="h3">${t('play.title')}</h2>
        <div class="opts">${options()}</div>
      </section>
    </div>`.s;
    el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    if (next?.player) {
      wireAnswers(el, {
        clubId: next.club.id, eventId: next.event.id, playerId: next.player.id,
        current: () => next?.registrations?.[next.player.id]?.status,
      });
    }
  }

  function eventCard() {
    const { club, event: e, player, registrations } = next;
    const c = counts(registrations);
    const mine = player ? registrations?.[player.id]?.status : null;
    // While it's on: LIVE, who's here, and a tap opens it to play; before: are you coming?
    const phase = Club.eventPhase(e);
    const on = phase === 'live' || phase === 'ended';
    const meta = [on ? t('event.until', { end: e.end }) : t('event.dayUntil', { day: dayName(e.date), end: e.end }), e.location,
      registrations ? t(on ? 'event.nHere' : 'event.nGoing', { n: c.going }) : null].filter(Boolean).join(' · ');
    return html`<div class="event-card${phase === 'live' ? ' is-live' : ''}" role="link" tabindex="0" data-go="#/club/${club.id}/event/${e.id}">
      <div class="line1"><span>${phase === 'live' ? html`<span class="chip live">${t('event.live')}</span> ${eventName(e)}` : phase === 'ended' ? t('event.endedName', { event: eventName(e) }) : t('event.next', { event: eventName(e) })}</span><span>${club.name}</span></div>
      <div class="time"><span class="cap">${e.start}</span></div>
      <div class="meta">${meta}</div>
      ${on ? html`<div class="go-on">${phase === 'live' ? t('event.tapToPlay') : t('event.seeResults')}${icon('chevron', 18)}</div>` : answerButtons(mine, player ? '' : noPlayer())}
    </div>`;
  }

  function options() {
    const started = hasStarted() && !isFinished();
    const tiles = M.display(state.match, state.rules).tiles;
    const tennis = sportOf(state.rules.sport).scoring === 'tennis';
    const names = displayNames();
    // Club matches are started from the event while it's on (tap the event above).
    const opt = (cls, ic, title, sub, to) => html`<button type="button" class="opt ${cls}" data-go="${to}">
        <span class="ic">${ic}</span><span class="grow"><strong>${title}</strong><small>${sub}</small></span></button>`;
    return [
      started ? opt('default', raw(sportIcon(state.rules.sport, 22)), t('play.continue'),
        `${names[0]} ${tiles[0]} – ${tiles[1]} ${names[1]} · ${t(tennis ? 'play.setN' : 'play.gameN', { n: state.match.games.length })}`, '#/match') : '',
      opt(started ? '' : 'default', icon('quick'), t('play.quick'), t('play.quickSub'), '#/match/new'),
    ];
  }

  async function loadNext() {
    const u = session.user;
    const mine = ++run;
    stopEvent?.();
    stopEvent = null;
    if (!u) {
      next = null;
      loading = session.started && !session.ready; // signed in last time: the event comes once known
      draw();
      return;
    }
    next = next ?? cachedNext(u.uid);
    loading = !next;
    if (loading || next) draw();
    try {
      const found = await nextOfAllClubs(u);
      if (mine !== run) return;
      next = found;
      loading = false;
      cacheNext(u.uid, found);
      draw();
      if (!found) return;
      const stop = await Club.watchEvent(found.club.id, found.event.id, (s) => {
        if (mine !== run || !next) return;
        next.registrations = s.registrations;
        if (s.event) next.event = s.event;
        cacheNext(u.uid, next);
        draw();
      });
      if (mine !== run) stop();
      else stopEvent = stop;
    } catch {
      loading = false; // offline: Play works without the event
      if (mine === run) draw();
    }
  }

  loadNext(); // draws at once; Firebase only loads when someone signed in before (see session.boot)
  let lastUser = session.user?.uid;
  const off = onSession(() => {
    if (session.user?.uid === lastUser && !(loading && session.ready && !session.user)) return;
    lastUser = session.user?.uid;
    loadNext();
  });
  // The event starts and ends on its own: redraw each minute.
  const tick = setInterval(() => { if (next) draw(); }, 60_000);
  return () => { run += 1; off(); stopEvent?.(); clearInterval(tick); };
}
