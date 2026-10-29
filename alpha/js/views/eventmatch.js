// A match during an event: pick the players of each side (or "Fill in for me": those waiting
// longest), who serves first, and start. The match is saved to the club while it's scored, so
// everyone sees it on the event, and it counts for the statistics.
import * as Club from '../club.js';
import * as Board from '../scoreboard.js';
import { session } from '../session.js';
import { rulesFor, sportIcon } from '../sports.js';
import { lastPlayed, playerKey } from '../stats.js';
import { html, raw, icon, avatar, sheet, toast } from '../ui.js';
import { t } from '../i18n.js';
import { clubScreen } from './clubview.js';
import { sportName, rulesSummary } from './rules.js';

const zeros = (on) => html`<span class="mini-tiles">${[0, 0].map(() => html`<span class="tile${on ? ' on' : ''}"><span class="cap">0</span><span class="split"></span></span>`)}</span>`;
const sideName = (players) => players.map((p) => p.name).join(' & ');

export function show(el, [clubId, eventId], { go }) {
  const sides = [[], []]; // picked players: { id?, name }
  let server = 0;
  let court = null; // picked, or the first free one
  let ev = null;
  let regs = {};
  let matches = [];
  let view = null;
  let stops = [];
  let closed = false;
  let starting = false;

  // Players by who should play next: here and not playing (waiting longest first), playing now,
  // and the others (no answer, not going).
  function groups() {
    const picked = new Set(sides.flat().map(playerKey));
    const last = lastPlayed(matches);
    const free = view.players.filter((p) => !picked.has(p.id));
    const playing = (p) => last[p.id] === Infinity;
    const waited = (p) => last[p.id] ?? 0; // never played yet: first
    return {
      here: free.filter((p) => regs[p.id]?.status === 'going' && !playing(p)).sort((a, b) => waited(a) - waited(b) || a.name.localeCompare(b.name)),
      playing: free.filter((p) => playing(p)).sort((a, b) => a.name.localeCompare(b.name)),
      others: free.filter((p) => regs[p.id]?.status !== 'going' && !playing(p)).sort((a, b) => a.name.localeCompare(b.name)),
      last,
    };
  }

  function draw(v) {
    view = v;
    if (!stops.length) follow();
    const rules = rulesFor(v.club.sport ?? 'badminton', v.club.defaults);
    const ready = sides[0].length && sides[1].length;
    const side = (n) => html`<div class="card pad" style="display:flex;flex-direction:column;gap:10px">
        <button type="button" class="serve-side" data-side="${n}" aria-pressed="${server === n}">
          ${zeros(server === n)}
          <span class="serve-hint">${server === n ? t('newMatch.servesFirst') : t('newMatch.tapToServe')}</span></button>
        ${sides[n].map((p, i) => html`<div class="row" style="padding:4px 0;min-height:0">${avatar(p.name)}<span class="grow"><strong>${p.name}</strong>${p.id ? '' : html`<small>${t('eventMatch.guest')}</small>`}</span>
          <button type="button" class="round" data-remove="${n}:${i}" aria-label="${t('people.removeName', { name: p.name })}" style="width:32px;height:32px">${icon('close', 14)}</button></div>`)}
        ${sides[n].length < 2 ? html`<button type="button" class="btn small" data-add="${n}">${icon('plus', 18)}${t('eventMatch.addPlayer')}</button>` : ''}
      </div>`;
    el.innerHTML = html`<div class="page">
      <div class="top"><a class="back" href="#/club/${clubId}/event/${eventId}">${icon('back', 22)}${t('event.event')}</a></div>
      <h1 class="title">${t('newMatch.title')}</h1>
      <div class="card row">${raw(sportIcon(rules.sport, 24))}<span class="grow"><strong>${sportName(rules.sport)}</strong><small>${rulesSummary(rules)}</small></span></div>
      ${courtChips(rules.sport)}
      <button type="button" class="btn" data-fill>${icon('dice', 20)}${t('eventMatch.fill')}</button>
      <div class="form-row" style="align-items:flex-start">${side(0)}${side(1)}</div>
      <p class="note" style="text-align:center">${t('eventMatch.sidesHint')}</p>
      <button type="button" class="btn primary block" data-start ${ready && !starting ? '' : 'disabled'}>${t('newMatch.start')}</button>
      ${ready ? '' : html`<p class="note" style="text-align:center;margin-top:-12px">${t('eventMatch.pickFirst')}</p>`}
    </div>`.s;
    el.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { server = Number(b.dataset.side); draw(view); }));
    el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.add))));
    el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      const [n, i] = b.dataset.remove.split(':').map(Number);
      sides[n].splice(i, 1);
      draw(view);
    }));
    el.querySelector('[data-fill]').addEventListener('click', fill);
    el.querySelectorAll('[data-court]').forEach((b) => b.addEventListener('click', () => { court = Number(b.dataset.court); draw(view); }));
    el.querySelector('[data-start]').addEventListener('click', () => start(rules));
  }

  // Which court (or table): the courts of the event; busy ones say so.
  function courtChips(sport) {
    const n = Math.max(1, ev?.courts ?? 1);
    const busy = new Set(matches.filter((m) => m.status === 'live').map((m) => m.court));
    const chosen = court ?? (Array.from({ length: n }, (_, i) => i + 1).find((c) => !busy.has(c)) ?? 1);
    court = chosen;
    const word = (c) => t(sport === 'tabletennis' ? 'screen.tableN' : 'screen.courtN', { n: c });
    return html`<section><h2 class="h3">${t(sport === 'tabletennis' ? 'eventMatch.table' : 'eventMatch.court')}</h2><div class="chips">
      ${Array.from({ length: n }, (_, i) => i + 1).map((c) => html`<button type="button" class="pick" data-court="${c}" aria-pressed="${c === chosen}">${word(c)}${busy.has(c) ? ` · ${t('eventMatch.busy')}` : ''}</button>`)}</div></section>`;
  }

  // Fills the open places with the players waiting longest: doubles when four are free,
  // otherwise singles.
  function fill() {
    const { here } = groups();
    const size = Math.max(sides[0].length, sides[1].length, here.length + sides.flat().length >= 4 ? 2 : 1);
    let i = 0;
    for (const n of [0, 1]) {
      while (sides[n].length < size && i < here.length) {
        const p = here[i++];
        sides[n].push({ id: p.id, name: p.name });
      }
    }
    if (!i) toast(t('eventMatch.nobodyFree'));
    draw(view);
  }

  function pick(n) {
    const { here, playing, others, last } = groups();
    const since = (p) => (last[p.id] ? t('eventMatch.waitingSince', { time: new Date(last[p.id]).toTimeString().slice(0, 5) }) : t('eventMatch.notPlayedYet'));
    const list = (title, players, sub) => (players.length ? html`<div><div class="h3">${title}</div><div class="card">
      ${players.map((p) => html`<button type="button" class="row" data-pick="${p.id}">${avatar(p.name)}<span class="grow"><strong>${p.name}</strong><small>${sub(p)}</small></span>${icon('plus', 18)}</button>`)}</div></div>` : '');
    sheet(html`<h2 class="sheet-title">${t('eventMatch.addPlayer')}</h2>
      ${list(t('eventMatch.here'), here, since)}
      ${list(t('eventMatch.playing'), playing, () => t('eventMatch.playingNow'))}
      ${list(t('eventMatch.others'), others, (p) => (regs[p.id]?.status === 'not going' ? t('answer.notGoing') : t('eventMatch.noAnswer')))}
      <div><div class="h3">${t('eventMatch.guest')}</div><div class="inline"><input type="text" data-guest maxlength="40" placeholder="${t('eventMatch.guestPlaceholder')}">
        <button type="button" class="btn small primary" data-guest-add>${t('common.add')}</button></div></div>`.s, (sh, close) => {
      sh.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
        const p = view.players.find((x) => x.id === b.dataset.pick);
        sides[n].push({ id: p.id, name: p.name });
        close();
        draw(view);
      }));
      const input = sh.querySelector('[data-guest]');
      const addGuest = () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        sides[n].push({ name });
        close();
        draw(view);
      };
      sh.querySelector('[data-guest-add]').addEventListener('click', addGuest);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } });
    });
  }

  async function start(rules) {
    if (starting || !sides[0].length || !sides[1].length) return;
    starting = true;
    const state = { games: [{ firstServer: server, rallies: [] }] };
    const home = sides[0].map((p) => (p.id ? { id: p.id, name: p.name } : { name: p.name }));
    const away = sides[1].map((p) => (p.id ? { id: p.id, name: p.name } : { name: p.name }));
    try {
      const matchId = await Club.addMatch(session.user, clubId, { eventId, sport: rules.sport, rules, home, away, state, court });
      Board.startMatch({
        names: [sideName(home), sideName(away)], namesKnown: true, firstServer: server, swapped: false,
        rules, link: { clubId, eventId, matchId },
      });
      go('#/match', { replace: true });
    } catch (e) {
      starting = false;
      toast(t('eventMatch.startFailed', { error: e.code || e.message }));
      draw(view);
    }
  }

  async function follow() {
    stops = [() => {}];
    const s1 = await Club.watchEvent(clubId, eventId, (s) => { regs = s.registrations; ev = s.event; if (view && !document.querySelector('.sheet-host')) draw(view); });
    const s2 = await Club.watchEventMatches(clubId, eventId, (list) => { matches = list; if (view && !document.querySelector('.sheet-host')) draw(view); });
    stops = [s1, s2];
    if (closed) stops.forEach((s) => s());
  }

  const screen = clubScreen(el, clubId, draw, { back: [`#/club/${clubId}/event/${eventId}`, t('event.event')] });
  return () => { closed = true; screen.cleanup(); stops.forEach((s) => s()); };
}
