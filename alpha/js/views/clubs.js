// Clubs: your clubs with their next event, joining one and starting one.
import * as Club from '../club.js';
import { session, onSession, start } from '../session.js';
import { pendingJoin, setPendingJoin, setLastClub } from '../links.js';
import { state } from '../state.js';
import { html, icon, sheet, toast } from '../ui.js';
import { t } from '../i18n.js';
import { backBar, mono, dayName, eventName, signInCard, spinner, noCloud } from './common.js';

// Shown while the screen can't list clubs: no online version, loading, or signed out.
export function gate(text) {
  if (noCloud()) return html`<div class="card"><p class="empty">${t('clubs.needOnline')}</p></div>`;
  if (!session.ready) {
    return session.started ? spinner()
      : html`<div class="card"><p class="empty">${session.message || t('signin.unreachable')}</p></div>`;
  }
  if (!session.user) return signInCard(text);
  return null;
}

export function show(el, _params, { go }) {
  let clubs = null; // [{ id, name, role, players, event, answer }]
  let run = 0;

  function draw() {
    const blocked = gate(t('clubs.signIn'));
    const join = pendingJoin();
    el.innerHTML = html`<div class="page">
      <h1 class="title">${t('tab.clubs')}</h1>
      ${join ? html`<a class="opt default" href="#/join"><span class="ic">${icon('invite', 20)}</span><span><strong>${t('join.invited')}</strong><small>${t('join.open')}</small></span></a>` : ''}
      ${blocked ?? (clubs === null ? spinner() : clubs.length ? html`<div class="opts">${clubs.map(card)}</div>`
        : html`<div class="card"><p class="empty">${t('clubs.none')}</p></div>`)}
      ${blocked ? '' : html`<section><h2 class="h3">${t('clubs.add')}</h2><div class="card">
        <button type="button" class="row" data-join>${icon('invite', 20)}<span class="grow"><strong>${t('join.title')}</strong><small>${t('clubs.joinSub')}</small></span>${icon('chevron', 18)}</button>
        <a class="row" href="#/clubs/new">${icon('plus', 20)}<span class="grow"><strong>${t('clubs.startNew')}</strong><small>${t('clubs.startNewSub')}</small></span>${icon('chevron', 18)}</a>
      </div></section>`}
    </div>`.s;
    el.querySelector('[data-join]')?.addEventListener('click', pasteInvite);
  }

  function card(c, i) {
    const sub = [c.role ? t(`role.${c.role}`) : null, c.players != null ? t('club.nPlayers', { n: c.players }) : null].filter(Boolean).join(' · ');
    const e = c.event;
    const answer = c.answer === 'going' ? html`<span class="chip going">${t('answer.going')}</span>`
      : c.answer === 'not going' ? html`<span class="chip notgoing">${t('answer.notGoing')}</span>` : e && c.hasPlayer ? html`<span class="chip">${t('answer.answer')}</span>` : '';
    return html`<a class="card" href="#/club/${c.id}" style="display:block">
      <div class="row" style="min-height:72px">${mono(c.name, i === 0)}<span class="grow"><strong style="font-size:17px">${c.name}</strong><small>${sub}</small></span>${icon('chevron', 18)}</div>
      ${e ? html`<div class="row" style="border-top:1px solid var(--line);min-height:64px">
        <span class="display" style="font-size:30px;line-height:1">${e.start}</span>
        <span class="grow"><strong>${dayName(e.date)}</strong><small>${eventName(e)}</small></span>${answer}</div>`
        : html`<div class="row muted" style="border-top:1px solid var(--line);min-height:64px">${c.loaded ? t('club.noEvents') : ''}</div>`}
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
        Object.assign(c, { role, players: players?.length, event, hasPlayer: Boolean(me), loaded: true });
        if (event && me) c.answer = (await Club.myRegistration(c.id, event.id, me.id).catch(() => null))?.status;
      }));
      if (mine !== run) return;
      clubs = clubs.filter((c) => c.role); // removed from a club: it no longer shows
      draw();
    } catch {
      if (mine !== run) return;
      clubs = [];
      draw();
      toast(t('clubs.loadFailed'));
    }
  }

  function pasteInvite() {
    sheet(html`<h2 class="sheet-title">${t('join.title')}</h2>
      <p class="sheet-text">${t('join.pasteText')}</p>
      <input type="url" data-link placeholder="https://…?join=…" autocomplete="off">
      <button type="button" class="btn primary block" data-go>${t('join.openButton')}</button>`.s, (sh, close) => {
      const input = sh.querySelector('[data-link]');
      const open = () => {
        const join = Club.parseJoin(input.value.slice(input.value.indexOf('?')));
        if (!join) { toast(t('join.notALink')); return; }
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
      const blocked = gate(t('create.signIn'));
      el.innerHTML = html`<div class="page">
        ${backBar('#/clubs', t('tab.clubs'))}
        <h1 class="title">${t('create.title')}</h1>
        ${blocked ?? html`
        <label class="field">${t('create.name')}<input type="text" data-name maxlength="60" placeholder="${t('create.namePlaceholder')}" value="${name}"></label>
        <section><h2 class="h3">${t('create.organised')}</h2><div class="card">
          <div class="radio-row" role="radio" aria-checked="true"><span class="radio"></span><span><strong>${t('create.oneTeam')}</strong>
            <small>${t('create.oneTeamSub')}</small></span></div>
          <div class="radio-row" role="radio" aria-checked="false" aria-disabled="true" style="opacity:.42"><span class="radio"></span><span><strong>${t('create.teams')}</strong>
            <small>${t('create.teamsSub')}</small></span></div>
        </div></section>
        <section><h2 class="h3">${t('create.sport')}</h2><div class="chips"><button type="button" class="pick" aria-pressed="true">${t('sport.badminton')}</button></div>
          <p class="note">${t('create.sportLater')}</p></section>
        <button type="button" class="btn primary block" data-start ${busy ? 'disabled' : ''}>${busy ? t('create.starting') : t('create.start')}</button>`}
      </div>`.s;
      const input = el.querySelector('[data-name]');
      input?.addEventListener('input', () => { name = input.value; });
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
      el.querySelector('[data-start]')?.addEventListener('click', create);
    }
    async function create() {
      if (busy) return;
      if (!name.trim()) { toast(t('create.nameFirst')); el.querySelector('[data-name]')?.focus(); return; }
      busy = true;
      draw();
      try {
        const id = await Club.createClub(session.user, name.trim(), { points: state.settings.points, bestOf: state.settings.bestOf });
        setLastClub(id);
        go(`#/club/${id}`, { replace: true });
      } catch (e) {
        busy = false;
        draw();
        toast(t('create.failed', { error: e.code || e.message }));
      }
    }
    start();
    draw();
    return onSession(() => { if (!el.querySelector('[data-name]') || !session.user) draw(); });
  },
};
