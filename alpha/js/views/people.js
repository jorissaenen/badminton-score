// People: members (with an account) and their roles, and players without an account. Members link
// themselves to a player ("That's me") so their answers and results are theirs.
import * as Club from '../club.js';
import { html, icon, avatar, choose, confirmSheet, attempt, toast, raw } from '../ui.js';
import { clubScreen } from './clubview.js';
import { t } from '../i18n.js';

const ORDER = { owner: 4, admin: 3, keeper: 2, member: 1 };

export function show(el, [clubId]) {
  let guest = ''; // the name being typed, kept across redraws

  function draw(v) {
    const { club, members, players, myRole, admin, me, myPlayer } = v;
    if (document.activeElement?.matches?.('[data-guest]')) return; // don't redraw under typing
    const sorted = [...members].sort((a, b) => (ORDER[b.role] ?? 0) - (ORDER[a.role] ?? 0) || a.name.localeCompare(b.name));
    const noAccount = players.filter((p) => !p.uid).sort((a, b) => a.name.localeCompare(b.name));
    el.innerHTML = html`<div class="page">
      <div class="top"><a class="back" href="#/club/${clubId}">${icon('back', 22)}${club.name}</a>
        ${admin ? html`<a class="btn small" href="#/club/${clubId}/invite">${icon('invite', 18)}${t('invite.title')}</a>` : ''}</div>
      <h1 class="title">${t('people.title')}</h1>
      ${myPlayer ? '' : html`<div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        <p class="sheet-text" style="margin:0">${noAccount.length ? t('people.linkYourselfList') : t('people.linkYourself')}</p>
        <button type="button" class="btn primary" data-add-me>${t('people.addMe')}</button></div>`}
      <section><h2 class="h3">${t('people.withAccount', { n: members.length })}</h2><div class="card">
        ${sorted.map((m) => {
          const isSelf = m.id === me.uid;
          const canChange = Club.assignableRoles(myRole, m.role, isSelf).length > 0 || (!isSelf && (myRole === 'owner' || (admin && m.role !== 'owner')));
          return html`<button type="button" class="row" data-member="${m.id}" ${canChange ? '' : raw(raw('disabled style="cursor:default"'))}>
            ${m.photoURL ? html`<img class="av" src="${m.photoURL}" alt="" referrerpolicy="no-referrer">` : avatar(m.name, isSelf ? 'me' : '')}
            <span class="grow"><strong>${m.name}${isSelf ? html` <span class="muted" style="font-weight:400">${t('common.you')}</span>` : ''}</strong></span>
            <span class="val">${t(`role.${m.role}`)}</span>${canChange ? icon('chevron', 18) : ''}</button>`;
        })}</div>
        ${admin ? html`<p class="note">${t('people.tapToManage')}</p>` : ''}</section>
      <section><h2 class="h3">${t('people.withoutAccount', { n: noAccount.length })}</h2><div class="card">
        ${noAccount.length ? noAccount.map((p) => html`<div class="row">${avatar(p.name, 'dashed')}<span class="grow"><strong>${p.name}</strong><small>${t('people.canLink')}</small></span>
            ${myPlayer ? '' : html`<button type="button" class="btn small" data-claim="${p.id}">${t('people.thatsMe')}</button>`}
            ${admin ? html`<button type="button" class="round" data-remove-player="${p.id}" aria-label="${t('people.removeName', { name: p.name })}" style="width:36px;height:36px">${icon('close', 16)}</button>` : ''}</div>`)
          : html`<p class="empty">${t('people.everyoneHasAccount')}</p>`}
        ${admin ? html`<div class="row" style="gap:10px"><input type="text" data-guest maxlength="40" placeholder="${t('people.guestPlaceholder')}" value="${guest}" style="margin:0">
          <button type="button" class="btn small primary" data-add-guest>${t('common.add')}</button></div>` : ''}
      </div></section>
      <section><h2 class="h3">${t('people.roles')}</h2><p class="note" style="margin-top:0">${t('people.rolesText')}</p></section>
    </div>`.s;

    el.querySelector('[data-add-me]')?.addEventListener('click', () => {
      const name = (me.displayName || me.email?.split('@')[0] || t('common.me')).slice(0, 40);
      attempt(Club.addPlayer(clubId, name, me.uid), t('people.addMeFailed'));
    });
    el.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => attempt(Club.claimPlayer(me, clubId, b.dataset.claim), t('people.claimFailed'))));
    el.querySelectorAll('[data-remove-player]').forEach((b) => b.addEventListener('click', async () => {
      const p = players.find((x) => x.id === b.dataset.removePlayer);
      if (await confirmSheet(t('people.removeQ', { name: p.name }), t('people.removePlayerText'), t('common.remove'), true)) attempt(Club.deletePlayer(clubId, p.id), t('people.removeFailed'));
    }));
    const input = el.querySelector('[data-guest]');
    const addGuest = async () => {
      const name = guest.trim();
      if (!name) { input.focus(); return; }
      guest = '';
      input.value = '';
      input.blur();
      if (await attempt(Club.addPlayer(clubId, name), t('people.addFailed'))) toast(t('people.added', { name }));
    };
    input?.addEventListener('input', () => { guest = input.value; });
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } });
    input?.addEventListener('blur', () => setTimeout(() => screen.redraw(), 0));
    el.querySelector('[data-add-guest]')?.addEventListener('click', addGuest);
    el.querySelectorAll('[data-member]').forEach((b) => b.addEventListener('click', () => manage(v, members.find((m) => m.id === b.dataset.member))));
  }

  async function manage(v, m) {
    const isSelf = m.id === v.me.uid;
    const roles = Club.assignableRoles(v.myRole, m.role, isSelf);
    const canRemove = !isSelf && (v.myRole === 'owner' || (v.admin && m.role !== 'owner'));
    const answer = await choose(m.name, t('people.nowRole', { role: t(`role.${m.role}`) }), [
      ...roles.filter((r) => r !== m.role).map((r) => ({ label: t(`people.make.${r}`), value: r })),
      ...(canRemove ? [{ label: t('people.removeFrom', { club: v.club.name }), value: 'remove', style: 'danger' }] : []),
    ]);
    if (!answer) return;
    if (answer === 'remove') {
      if (await confirmSheet(t('people.removeQ', { name: m.name }), t('people.removeMemberText', { club: v.club.name }), t('common.remove'), true)) attempt(Club.removeMember(clubId, m.id), t('people.removeFailed'));
      return;
    }
    if (answer === 'owner' && !(await confirmSheet(t('people.makeOwnerQ', { name: m.name }), t('people.makeOwnerText'), t('people.make.owner')))) return;
    attempt(Club.setRole(clubId, m.id, answer), t('people.roleFailed'));
  }

  const screen = clubScreen(el, clubId, draw, { back: [`#/club/${clubId}`, t('club.club')] });
  return screen.cleanup;
}
