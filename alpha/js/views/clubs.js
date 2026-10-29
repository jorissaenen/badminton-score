// Clubs: your clubs with their next event, joining one and starting one.
import * as Club from '../club.js';
import { session, onSession, start } from '../session.js';
import { pendingJoin, setPendingJoin, setLastClub } from '../links.js';
import { state } from '../state.js';
import { html, icon, sheet, toast } from '../ui.js';
import { backBar, mono, dayName, eventName, plural, signInCard, spinner, noCloud } from './common.js';

// Shown while the screen can't list clubs: no online version, loading, or signed out.
export function gate(text) {
  if (noCloud()) return html`<div class="card"><p class="empty">Clubs need the online version of the app.</p></div>`;
  if (!session.ready) {
    return session.started ? spinner()
      : html`<div class="card"><p class="empty">${session.message || 'Can’t reach the sign-in service right now (offline?).'}</p></div>`;
  }
  if (!session.user) return signInCard(text);
  return null;
}

export function show(el, _params, { go }) {
  let clubs = null; // [{ id, name, role, players, event, answer }]
  let run = 0;

  function draw() {
    const blocked = gate('Sign in to see your clubs, plan training and see who’s coming.');
    const join = pendingJoin();
    el.innerHTML = html`<div class="page">
      <h1 class="title">Clubs</h1>
      ${join ? html`<a class="opt default" href="#/join"><span class="ic">${icon('invite', 20)}</span><span><strong>You’re invited to a club</strong><small>Open the invite</small></span></a>` : ''}
      ${blocked ?? (clubs === null ? spinner() : clubs.length ? html`<div class="opts">${clubs.map(card)}</div>`
        : html`<div class="card"><p class="empty">You’re not in a club yet. Join one with an invite link, or start your own.</p></div>`)}
      ${blocked ? '' : html`<section><h2 class="h3">Add a club</h2><div class="card">
        <button type="button" class="row" data-join>${icon('invite', 20)}<span class="grow"><strong>Join a club</strong><small>Open the invite link, or scan its QR code</small></span>${icon('chevron', 18)}</button>
        <a class="row" href="#/clubs/new">${icon('plus', 20)}<span class="grow"><strong>Start a new club</strong><small>You become its owner and invite the others</small></span>${icon('chevron', 18)}</a>
      </div></section>`}
    </div>`.s;
    el.querySelector('[data-join]')?.addEventListener('click', pasteInvite);
  }

  function card(c, i) {
    const sub = [Club.ROLE_NAMES[c.role], c.players != null ? plural(c.players, 'player') : null].filter(Boolean).join(' · ');
    const e = c.event;
    const answer = c.answer === 'going' ? html`<span class="chip going">Going</span>`
      : c.answer === 'not going' ? html`<span class="chip notgoing">Not going</span>` : e && c.hasPlayer ? html`<span class="chip">Answer</span>` : '';
    return html`<a class="card" href="#/club/${c.id}" style="display:block">
      <div class="row" style="min-height:72px">${mono(c.name, i === 0)}<span class="grow"><strong style="font-size:17px">${c.name}</strong><small>${sub}</small></span>${icon('chevron', 18)}</div>
      ${e ? html`<div class="row" style="border-top:1px solid var(--line)">
        <span class="display" style="font-size:30px;line-height:1">${e.start}</span>
        <span class="grow"><strong>${dayName(e.date)}</strong><small>${eventName(e)}</small></span>${answer}</div>` : ''}
    </a>`;
  }

  async function load() {
    const u = session.user;
    const mine = ++run;
    if (!u) { clubs = null; draw(); return; }
    try {
      const list = await Club.myClubs(u);
      if (mine !== run) return;
      clubs = list.map((c) => ({ ...c }));
      draw();
      await Promise.all(clubs.map(async (c) => {
        const [role, players, event] = await Promise.all([
          Club.myRoleIn(u, c.id), Club.listPlayers(c.id).catch(() => null), Club.nextEvent(c.id).catch(() => null),
        ]);
        const me = players?.find((p) => p.uid === u.uid);
        Object.assign(c, { role, players: players?.length, event, hasPlayer: Boolean(me) });
        if (event && me) c.answer = (await Club.myRegistration(c.id, event.id, me.id).catch(() => null))?.status;
      }));
      if (mine !== run) return;
      clubs = clubs.filter((c) => c.role); // removed from a club: it no longer shows
      draw();
    } catch {
      if (mine !== run) return;
      clubs = [];
      draw();
      toast('Can’t load your clubs right now (offline?)');
    }
  }

  function pasteInvite() {
    sheet(html`<h2 class="sheet-title">Join a club</h2>
      <p class="sheet-text">Open the invite link you got, or scan its QR code with the phone’s camera. Or paste the link here:</p>
      <input type="url" data-link placeholder="https://…?join=…" autocomplete="off">
      <button type="button" class="btn primary block" data-go>Open invite</button>`.s, (sh, close) => {
      const input = sh.querySelector('[data-link]');
      const open = () => {
        const join = Club.parseJoin(input.value.slice(input.value.indexOf('?')));
        if (!join) { toast('That isn’t an invite link'); return; }
        setPendingJoin(join);
        close();
        go('#/join');
      };
      sh.querySelector('[data-go]').addEventListener('click', open);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
    });
  }

  start();
  draw();
  load();
  let lastUser = session.user?.uid;
  const off = onSession(() => {
    if (session.user?.uid === lastUser && session.ready) return;
    lastUser = session.user?.uid;
    load();
  });
  return () => { run += 1; off(); };
}

// ---------- starting a club ----------

export const Create = {
  show(el, _params, { go }) {
    let busy = false;
    let name = '';
    function draw() {
      const blocked = gate('Sign in to start a club.');
      el.innerHTML = html`<div class="page">
        ${backBar('#/clubs', 'Clubs')}
        <h1 class="title">Start a club</h1>
        ${blocked ?? html`
        <label class="field">Club name<input type="text" data-name maxlength="60" placeholder="e.g. BC Partymakers" value="${name}"></label>
        <section><h2 class="h3">How is the club organised?</h2><div class="card">
          <div class="radio-row" role="radio" aria-checked="true"><span class="radio"></span><span><strong>One team</strong>
            <small>A group of friends or a small club that plays together. Everything stays simple.</small></span></div>
          <div class="radio-row" role="radio" aria-checked="false" aria-disabled="true" style="opacity:.42"><span class="radio"></span><span><strong>Several teams</strong>
            <small>For example U9, U11, U13 and adults, each with its own players and events. Comes in a next version; your club keeps everything when you add teams later.</small></span></div>
        </div></section>
        <section><h2 class="h3">Sport</h2><div class="chips"><button type="button" class="pick" aria-pressed="true">Badminton</button></div>
          <p class="note">Other sports come later.</p></section>
        <button type="button" class="btn primary block" data-start ${busy ? 'disabled' : ''}>${busy ? 'Starting…' : 'Start'}</button>`}
      </div>`.s;
      const input = el.querySelector('[data-name]');
      input?.addEventListener('input', () => { name = input.value; });
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
      el.querySelector('[data-start]')?.addEventListener('click', create);
    }
    async function create() {
      if (busy) return;
      if (!name.trim()) { toast('Give the club a name first'); el.querySelector('[data-name]')?.focus(); return; }
      busy = true;
      draw();
      try {
        const id = await Club.createClub(session.user, name.trim(), { points: state.settings.points, bestOf: state.settings.bestOf });
        setLastClub(id);
        go(`#/club/${id}`, { replace: true });
      } catch (e) {
        busy = false;
        draw();
        toast(`Couldn’t start the club (${e.code || e.message})`);
      }
    }
    start();
    draw();
    return onSession(() => { if (!el.querySelector('[data-name]') || !session.user) draw(); });
  },
};
