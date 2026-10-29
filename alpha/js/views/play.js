// Play: the next event of your clubs (are you coming?) and the ways to start keeping score.
import * as M from '../match.js';
import * as Club from '../club.js';
import { session, onSession } from '../session.js';
import { state, hasStarted, isFinished, displayNames } from '../state.js';
import { html, icon, initials } from '../ui.js';
import { t } from '../i18n.js';
import { answerButtons, wireAnswers, counts, dayName, eventName, nextOfAllClubs, noPlayer } from './common.js';

export function show(el, _params, { go }) {
  let next = null; // { club, event, player, registrations }
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
      ${next ? eventCard() : ''}
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
    const meta = [t('event.dayUntil', { day: dayName(e.date), end: e.end }), e.location, registrations ? t('event.nGoing', { n: c.going }) : null].filter(Boolean).join(' · ');
    return html`<div class="event-card" role="link" tabindex="0" data-go="#/club/${club.id}/event/${e.id}">
      <div class="line1"><span>${t('event.next', { event: eventName(e) })}</span><span>${club.name}</span></div>
      <div class="time"><span class="cap">${e.start}</span></div>
      <div class="meta">${meta}</div>
      ${answerButtons(mine, player ? '' : noPlayer())}
    </div>`;
  }

  function options() {
    const started = hasStarted() && !isFinished();
    const g = M.currentGame(state.match);
    const sc = M.gameScore(g);
    const names = displayNames();
    const eventSoon = next ? t('play.duringEventNext', { day: dayName(next.event.date), time: next.event.start }) : t('play.duringEvent');
    const later = t('play.later');
    const opt = (cls, ic, title, sub, to, off = '') => html`<button type="button" class="opt ${cls}" ${to && !off ? html`data-go="${to}"` : ''} ${off ? 'aria-disabled="true"' : ''}>
        <span class="ic">${ic}</span><span><strong>${title}</strong><small>${off || sub}</small></span></button>`;
    return [
      started ? opt('default', html`<span class="display" style="font-size:17px">${String(Math.max(...sc)).padStart(2, '0')}</span>`, t('play.continue'),
        `${names[0]} ${sc[0]} – ${sc[1]} ${names[1]}${state.rules.bestOf > 1 ? ` · ${t('play.gameN', { n: state.match.games.length })}` : ''}`, '#/match') : '',
      opt('', icon('court'), t('play.clubMatch'), eventSoon, null, later),
      opt('', icon('screen'), t('play.followCourt'), eventSoon, null, later),
      opt(started ? '' : 'default', icon('quick'), t('play.quick'), t('play.quickSub'), '#/match/new'),
    ];
  }

  async function loadNext() {
    const u = session.user;
    const mine = ++run;
    stopEvent?.();
    stopEvent = null;
    if (!u) { next = null; draw(); return; }
    try {
      const found = await nextOfAllClubs(u);
      if (mine !== run) return;
      next = found;
      draw();
      if (!found) return;
      const stop = await Club.watchEvent(found.club.id, found.event.id, (s) => {
        if (mine !== run || !next) return;
        next.registrations = s.registrations;
        if (s.event) next.event = s.event;
        draw();
      });
      if (mine !== run) stop();
      else stopEvent = stop;
    } catch { /* offline: Play works without the event */ }
  }

  draw();
  loadNext(); // Firebase only loads when someone signed in before (see session.boot)
  let lastUser = session.user?.uid;
  const off = onSession(() => {
    if (session.user?.uid === lastUser) return;
    lastUser = session.user?.uid;
    loadNext();
  });
  return () => { run += 1; off(); stopEvent?.(); };
}
