// People: members (with an account) and their roles, and players without an account. Members link
// themselves to a player ("That's me") so their answers and results are theirs.
import * as Club from '../club.js';
import { html, icon, avatar, choose, confirmSheet, attempt, toast } from '../ui.js';
import { clubScreen } from './clubview.js';

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
        ${admin ? html`<a class="btn small" href="#/club/${clubId}/invite">${icon('invite', 18)}Invite</a>` : ''}</div>
      <h1 class="title">People</h1>
      ${myPlayer ? '' : html`<div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        <p class="sheet-text" style="margin:0">Link yourself to a player to answer for events.${noAccount.length ? ' Already on the list below? Tap That’s me.' : ''}</p>
        <button type="button" class="btn primary" data-add-me>Add me as a player</button></div>`}
      <section><h2 class="h3">With an account · ${members.length}</h2><div class="card">
        ${sorted.map((m) => {
          const isSelf = m.id === me.uid;
          const canChange = Club.assignableRoles(myRole, m.role, isSelf).length > 0 || (!isSelf && (myRole === 'owner' || (admin && m.role !== 'owner')));
          return html`<button type="button" class="row" data-member="${m.id}" ${canChange ? '' : 'disabled style="cursor:default"'}>
            ${m.photoURL ? html`<img class="av" src="${m.photoURL}" alt="" referrerpolicy="no-referrer">` : avatar(m.name, isSelf ? 'me' : '')}
            <span class="grow"><strong>${m.name}${isSelf ? html` <span class="muted" style="font-weight:400">you</span>` : ''}</strong></span>
            <span class="val">${Club.ROLE_NAMES[m.role]}</span>${canChange ? icon('chevron', 18) : ''}</button>`;
        })}</div>
        ${admin ? html`<p class="note">Tap someone to change their role or remove them.</p>` : ''}</section>
      <section><h2 class="h3">Without an account · ${noAccount.length}</h2><div class="card">
        ${noAccount.length ? noAccount.map((p) => html`<div class="row">${avatar(p.name, 'dashed')}<span class="grow"><strong>${p.name}</strong><small>Can link this name after joining</small></span>
            ${myPlayer ? '' : html`<button type="button" class="btn small" data-claim="${p.id}">That’s me</button>`}
            ${admin ? html`<button type="button" class="round" data-remove-player="${p.id}" aria-label="Remove ${p.name}" style="width:36px;height:36px">${icon('close', 16)}</button>` : ''}</div>`)
          : html`<p class="empty">Everyone has an account.</p>`}
        ${admin ? html`<div class="row" style="gap:10px"><input type="text" data-guest maxlength="40" placeholder="Name of a player without an account" value="${guest}" style="margin:0">
          <button type="button" class="btn small primary" data-add-guest>Add</button></div>` : ''}
      </div></section>
      <section><h2 class="h3">Roles</h2><p class="note" style="margin-top:0">Members see everything and answer for events. Score keepers also score club matches. Admins also plan events, invite and manage people. Owners can do everything, including deleting the club.</p></section>
    </div>`.s;

    el.querySelector('[data-add-me]')?.addEventListener('click', () => {
      const name = (me.displayName || me.email?.split('@')[0] || 'Me').slice(0, 40);
      attempt(Club.addPlayer(clubId, name, me.uid), 'Couldn’t add you');
    });
    el.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => attempt(Club.claimPlayer(me, clubId, b.dataset.claim), 'Couldn’t link this player to you')));
    el.querySelectorAll('[data-remove-player]').forEach((b) => b.addEventListener('click', async () => {
      const p = players.find((x) => x.id === b.dataset.removePlayer);
      if (await confirmSheet(`Remove ${p.name}?`, 'Their answers for events go too.', 'Remove', true)) attempt(Club.deletePlayer(clubId, p.id), 'Couldn’t remove');
    }));
    const input = el.querySelector('[data-guest]');
    const addGuest = async () => {
      const name = guest.trim();
      if (!name) { input.focus(); return; }
      guest = '';
      input.value = '';
      input.blur();
      if (await attempt(Club.addPlayer(clubId, name), 'Couldn’t add the player')) toast(`${name} added`);
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
    const answer = await choose(m.name, `Now ${Club.ROLE_NAMES[m.role].toLowerCase()}.`, [
      ...roles.filter((r) => r !== m.role).map((r) => ({ label: `Make ${Club.ROLE_NAMES[r].toLowerCase()}`, value: r })),
      ...(canRemove ? [{ label: `Remove from ${v.club.name}`, value: 'remove', style: 'danger' }] : []),
    ]);
    if (!answer) return;
    if (answer === 'remove') {
      if (await confirmSheet(`Remove ${m.name}?`, `They need a new invite to come back to ${v.club.name}.`, 'Remove', true)) attempt(Club.removeMember(clubId, m.id), 'Couldn’t remove');
      return;
    }
    if (answer === 'owner' && !(await confirmSheet(`Make ${m.name} owner?`, 'Owners can do everything, including deleting the club.', 'Make owner'))) return;
    attempt(Club.setRole(clubId, m.id, answer), 'Couldn’t change the role');
  }

  const screen = clubScreen(el, clubId, draw, { back: [`#/club/${clubId}`, 'Club'] });
  return screen.cleanup;
}
