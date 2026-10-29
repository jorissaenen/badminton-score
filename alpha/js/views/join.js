// Opened an invite link: who invited you to which club, signing in if needed, joining, and then
// "which player are you?" so earlier results stay yours.
import * as Club from '../club.js';
import { session, onSession, start } from '../session.js';
import { pendingJoin, setPendingJoin, setLastClub } from '../links.js';
import { html, icon, avatar, toast } from '../ui.js';
import { backBar, mono, spinner } from './common.js';
import { gate } from './clubs.js';
import { t } from '../i18n.js';

export function show(el, _params, { go }) {
  const join = pendingJoin();
  let invite; // undefined: loading; null: expired or withdrawn
  let busy = false;
  let run = 0;

  const page = (body) => { el.innerHTML = html`<div class="page">${backBar('#/clubs', t('tab.clubs'))}${body}</div>`.s; };

  function clear() {
    setPendingJoin(null);
  }

  async function draw() {
    if (!join) { page(html`<div class="card"><p class="empty">${t('join.noInvite')}</p></div>`); return; }
    const blocked = gate(t('join.signInFirst'));
    if (blocked) { page(html`<h1 class="title">${t('join.title')}</h1>${blocked}`); return; }
    const mine = ++run;
    const u = session.user;
    if (invite === undefined) {
      page(spinner());
      if (await Club.myRoleIn(u, join.clubId)) {
        // Already a member: make sure the club is in the list, and open it.
        const known = await Club.readInvite(join.clubId, join.token).catch(() => null);
        await Club.rememberClub(u, join.clubId, known?.clubName ?? t('club.club'), known?.clubSport).catch(() => {});
        clear();
        toast(t('join.already'));
        go(`#/club/${join.clubId}`, { replace: true });
        return;
      }
      try {
        invite = await Club.readInvite(join.clubId, join.token);
        if (invite?.expired) invite = null;
      } catch {
        if (mine !== run) return;
        page(html`<div class="card"><p class="empty">${t('join.cantCheck')}</p></div>`);
        invite = undefined;
        return;
      }
      if (mine !== run) return;
    }
    if (!invite) {
      page(html`<h1 class="title">${t('join.title')}</h1><div class="card"><p class="empty">${t('join.expired')}</p></div>
        <button type="button" class="btn block" data-ok>${t('common.ok')}</button>`);
      el.querySelector('[data-ok]').addEventListener('click', () => { clear(); go('#/clubs', { replace: true }); });
      return;
    }
    const name = u.displayName || u.email;
    page(html`<div style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;margin-top:12px">
        ${mono(invite.clubName, true, invite.clubSport ?? 'badminton')}
        <h1 class="title" style="margin:0">${t('join.joinClub', { club: invite.clubName })}</h1>
        <p class="sub" style="margin:0">${t('join.invitedAs', { role: t(`role.${invite.role}`) })}</p></div>
      <div class="card"><div class="row">${avatar(name, 'me', { photo: session.photo })}<span class="grow"><strong>${t('join.signedInAs', { name })}</strong><small>${u.email ?? ''}</small></span></div></div>
      <button type="button" class="btn primary block" data-join ${busy ? 'disabled' : ''}>${busy ? t('join.joining') : t('join.join')}</button>
      <button type="button" class="link-btn" data-later>${t('common.notNow')}</button>`);
    el.querySelector('[data-join]').addEventListener('click', doJoin);
    el.querySelector('[data-later]').addEventListener('click', () => { clear(); go('#/clubs', { replace: true }); });
  }

  async function doJoin() {
    if (busy) return;
    busy = true;
    draw();
    try {
      await Club.join(session.user, join.clubId, join.token, invite);
      clear();
      setLastClub(join.clubId);
      toast(t('join.welcome', { club: invite.clubName }));
      await whichPlayer();
    } catch (e) {
      busy = false;
      draw();
      toast(t('join.failed', { error: e.code || e.message }));
    }
  }

  // Pick your name if the club already added you, so your earlier answers and results stay yours.
  async function whichPlayer() {
    const players = (await Club.listPlayers(join.clubId).catch(() => [])).filter((p) => !p.uid).sort((a, b) => a.name.localeCompare(b.name));
    if (!players.length) {
      await addMe();
      go(`#/club/${join.clubId}`, { replace: true });
      return;
    }
    el.innerHTML = html`<div class="page">
      <h1 class="title">${t('join.whichPlayer')}</h1>
      <p class="sub">${t('join.whichPlayerText', { club: invite.clubName })}</p>
      <div class="card">${players.map((p) => html`<button type="button" class="row" data-claim="${p.id}">${avatar(p.name, 'dashed')}<span class="grow"><strong>${p.name}</strong></span>${icon('chevron', 18)}</button>`)}
        <button type="button" class="row" data-new>${icon('plus', 20)}<span class="grow"><strong>${t('join.notOnList')}</strong></span>${icon('chevron', 18)}</button></div>
    </div>`.s;
    el.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await Club.claimPlayer(session.user, join.clubId, b.dataset.claim);
      } catch (e) {
        toast(t('join.claimFailed', { error: e.code || e.message }));
      }
      go(`#/club/${join.clubId}`, { replace: true });
    }));
    el.querySelector('[data-new]').addEventListener('click', async () => {
      await addMe();
      go(`#/club/${join.clubId}`, { replace: true });
    });
  }

  async function addMe() {
    const u = session.user;
    const name = (u.displayName || u.email?.split('@')[0] || t('common.me')).slice(0, 40);
    await Club.addPlayer(join.clubId, name, u.uid).catch(() => toast(t('join.addMeFailed')));
  }

  start();
  draw();
  const who = () => `${session.ready}:${session.user?.uid ?? ''}`;
  let last = who();
  const off = onSession(() => {
    if (who() === last) return;
    last = who();
    invite = undefined;
    draw();
  });
  return () => { run += 1; off(); };
}
