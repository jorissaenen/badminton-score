// Club home: the season, the next event (are you coming?), the events after it, and the way to
// people, invites and settings.
import * as Club from '../club.js';
import { html, icon, avatar } from '../ui.js';
import { clubScreen } from './clubview.js';
import { answerButtons, wireAnswers, counts, dayName, eventName, mono, plural, NO_PLAYER } from './common.js';

const monthDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' });

export function show(el, [clubId]) {
  let events = null;
  let regs = {};
  let stopEvents = null;
  let stopRegs = null;
  let view = null;

  function draw(v) {
    view = v;
    const { club, myRole, admin, players, seasons, myPlayer } = v;
    const season = Club.currentSeason(seasons);
    const upcoming = events ?? [];
    const next = upcoming.find((e) => e.status !== 'cancelled');
    const later = upcoming.filter((e) => e !== next);
    el.innerHTML = html`<div class="page">
      <div class="top"><a class="back" href="#/clubs">${icon('back', 22)}Clubs</a>
        <span class="board-buttons">
          ${admin ? html`<a class="round" href="#/club/${clubId}/invite" aria-label="Invite">${icon('invite', 20)}</a>` : ''}
          <a class="round" href="#/club/${clubId}/settings" aria-label="Club settings">${icon('settings', 20)}</a>
        </span></div>
      <div style="display:flex;align-items:center;gap:14px">${mono(club.name, true)}
        <div><h1 class="title small">${club.name}</h1>
        <p class="sub" style="margin:4px 0 0">You’re ${myRole === 'admin' || myRole === 'owner' ? 'the' : 'a'} ${Club.ROLE_NAMES[myRole].toLowerCase()} · ${plural(players.length, 'player')}</p></div></div>
      ${season ? html`<a class="card row" href="#/club/${clubId}/settings">${icon('calendar', 20)}<span class="grow"><strong>Season ${season.name}</strong>
          <small>${monthDay(season.start)} – ${monthDay(season.end)}</small></span>${icon('chevron', 18)}</a>`
        : admin ? html`<a class="card row" href="#/club/${clubId}/settings">${icon('calendar', 20)}<span class="grow"><strong>Add a season</strong><small>Results count per season</small></span>${icon('chevron', 18)}</a>` : ''}
      ${events === null ? '' : next ? nextCard(next, myPlayer) : html`<div class="card"><p class="empty">No events planned yet.${admin ? '' : ' Admins plan them.'}</p></div>`}
      ${later.length ? html`<section><h2 class="h3">Coming up</h2><div class="card">${later.map((e) => row(e, myPlayer))}</div></section>` : ''}
      <div>
        <a class="btn primary block" ${admin ? html`href="#/club/${clubId}/plan"` : 'aria-disabled="true"'}>${icon('plus', 20)}Plan an event</a>
        ${admin ? '' : html`<p class="note" style="text-align:center">Admins and owners plan events.</p>`}
      </div>
      <div class="card"><a class="row" href="#/club/${clubId}/people">${icon('clubs', 20)}<span class="grow"><strong>People</strong>
        <small>${plural(players.length, 'player')} · ${plural(v.members.length, 'member')}</small></span>${icon('chevron', 18)}</a></div>
    </div>`.s;
    const card = el.querySelector('[data-next]');
    card?.addEventListener('click', (ev) => { if (!ev.target.closest('button')) location.hash = `#/club/${clubId}/event/${next.id}`; });
    card?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target === card) location.hash = `#/club/${clubId}/event/${next.id}`; });
    watchEvents();
    if (next && myPlayer) {
      wireAnswers(card, {
        clubId, eventId: next.id, playerId: myPlayer.id, current: () => regs[next.id]?.[myPlayer.id]?.status,
      });
    }
  }

  function nextCard(e, myPlayer) {
    const r = regs[e.id];
    const c = counts(r);
    const going = r ? view.players.filter((p) => r[p.id]?.status === 'going') : [];
    const noAnswer = r ? view.players.length - c.going - c.notGoing : null;
    return html`<div class="event-card" role="link" tabindex="0" data-next>
      <div class="line1"><span>Next · ${eventName(e)}</span><span>${dayName(e.date)}</span></div>
      <div class="time"><span class="cap">${e.start}</span></div>
      <div class="meta">${[`until ${e.end}`, e.location, plural(e.courts, 'court')].filter(Boolean).join(' · ')}</div>
      ${r ? html`<div style="display:flex;align-items:center;gap:10px;margin-top:12px">
        <span style="display:flex">${going.slice(0, 5).map((p, i) => html`<span style="margin-left:${i ? -8 : 0}px">${avatar(p.name, p.id === myPlayer?.id ? 'me' : '')}</span>`)}</span>
        <span class="muted" style="font-size:13px">${c.going} going · ${c.notGoing} not · ${noAnswer} no answer</span></div>` : ''}
      ${answerButtons(myPlayer ? r?.[myPlayer.id]?.status : null, myPlayer ? '' : NO_PLAYER)}
    </div>`;
  }

  function row(e, myPlayer) {
    const r = regs[e.id];
    const mine = myPlayer && r ? r[myPlayer.id]?.status : undefined;
    const day = new Date(`${e.date}T12:00:00`);
    const chip = e.status === 'cancelled' ? html`<span class="chip notgoing">Cancelled</span>`
      : mine === 'going' ? html`<span class="chip going">Going</span>` : mine === 'not going' ? html`<span class="chip notgoing">Not going</span>`
        : myPlayer && r ? html`<span class="chip">?</span>` : '';
    const details = [`${e.start}–${e.end}`, e.courts > 2 ? plural(e.courts, 'court') : null, r ? `${counts(r).going} going` : null].filter(Boolean).join(' · ');
    return html`<a class="row" href="#/club/${clubId}/event/${e.id}">
      <span style="width:40px;text-align:center;flex:none"><span class="muted" style="display:block;font-size:11px;font-weight:700;letter-spacing:.08em">${day.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</span>
        <span class="display" style="display:block;font-size:24px;line-height:1">${day.getDate()}</span></span>
      <span class="grow"><strong>${eventName(e)}</strong><small>${details}</small></span>${chip}</a>`;
  }

  // Starts once the club is open (signed in, and a member).
  let watching = false;
  async function watchEvents() {
    if (watching) return;
    watching = true;
    stopEvents = await Club.watchUpcoming(clubId, async (list) => {
      events = list;
      screen.redraw();
      stopRegs?.();
      if (closed) return;
      stopRegs = await Club.watchRegistrations(clubId, list.slice(0, 8).map((e) => e.id), (all) => {
        regs = all;
        screen.redraw();
      });
    }).catch(() => null);
    if (closed) stopEvents?.();
  }

  let closed = false;
  const screen = clubScreen(el, clubId, draw);
  return () => { closed = true; screen.cleanup(); stopEvents?.(); stopRegs?.(); };
}
