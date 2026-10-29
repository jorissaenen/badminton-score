// Opened by scanning a screen's QR code (…/?display=<key>): pick one of today's events (in the
// clubs where you keep score, or are admin or owner), then what the screen shows.
import * as Club from '../club.js';
import { session, onSession, start } from '../session.js';
import { sportIcon } from '../sports.js';
import { html, raw, icon } from '../ui.js';
import { t } from '../i18n.js';
import { backBar, eventName, spinner } from './common.js';
import { gate } from './clubs.js';
import { screenSheet } from './screens.js';

export function show(el, [key], { go }) {
  let events = null;
  let run = 0;

  function draw() {
    const blocked = gate(t('screen.signIn'));
    el.innerHTML = html`<div class="page">
      ${backBar('#/play', t('play.title'))}
      <h1 class="title">${t('screen.link')}</h1>
      <p class="sub">${t('screen.keyIs', { key: `${key.slice(0, 3)} ${key.slice(3)}` })}</p>
      ${blocked ?? (events === null ? spinner() : events.length ? html`<section><h2 class="h3">${t('screen.whichEvent')}</h2><div class="card">
        ${events.map((x, i) => html`<button type="button" class="row" data-i="${i}">${raw(sportIcon(x.club.sport ?? 'badminton', 22))}
          <span class="grow"><strong>${eventName(x.event)} · ${x.event.start}–${x.event.end}</strong><small>${x.club.name}</small></span>${icon('chevron', 18)}</button>`)}</div></section>`
        : html`<div class="card"><p class="empty">${t('screen.noEventToday')}</p></div>`)}
    </div>`.s;
    el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const x = events[Number(b.dataset.i)];
      screenSheet({
        clubId: x.club.id, eventId: x.event.id, courts: x.event.courts, sport: x.club.sport ?? 'badminton', key,
        done: () => go(`#/club/${x.club.id}/event/${x.event.id}`, { replace: true }),
      });
    }));
  }

  async function load() {
    const mine = ++run;
    if (!session.user) { draw(); return; }
    events = await Club.eventsToLinkTo(session.user).catch(() => []);
    if (mine === run) draw();
  }

  start();
  draw();
  load();
  const who = () => `${session.ready}:${session.user?.uid ?? ''}`;
  let last = who();
  const off = onSession(() => { if (who() !== last) { last = who(); load(); } });
  return () => { run += 1; off(); };
}
