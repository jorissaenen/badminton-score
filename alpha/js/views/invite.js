// Invite: a link and QR code that let people join for a while, with the role they get; and the
// links still open, to withdraw.
import qrcode from '../vendor/qrcode.js';
import * as Club from '../club.js';
import { session } from '../session.js';
import { html, icon, attempt, toast, dayText } from '../ui.js';
import { clubScreen } from './clubview.js';
import { plural } from './common.js';

const daysLeft = (ts) => {
  const days = Math.round((ts.toMillis() - Date.now()) / 86400_000);
  return days >= 1 ? `${plural(days, 'day')} left` : 'expires today';
};

export function show(el, [clubId]) {
  const pick = { role: 'member', days: 7 };
  let made = null; // { link, role, days, qr, text }
  let busy = false;

  function draw(v) {
    const { club, admin, invites } = v;
    if (!admin) {
      el.innerHTML = html`<div class="page">${top(club)}<div class="card"><p class="empty">Only admins and owners invite people.</p></div></div>`.s;
      return;
    }
    const roles = ['member', 'keeper', 'admin'];
    const until = dayText(Club.isoDate(new Date(Date.now() + pick.days * 86400_000)));
    el.innerHTML = html`<div class="page">
      ${top(club)}
      <h1 class="title">Invite</h1>
      <section><h2 class="h3">Joins as</h2><div class="chips">${roles.map((r) => html`<button type="button" class="pick" data-role="${r}" aria-pressed="${pick.role === r}">${Club.ROLE_NAMES[r]}</button>`)}</div></section>
      <section><h2 class="h3">Link works for</h2><div class="chips">${[1, 7, 30].map((d) => html`<button type="button" class="pick" data-days="${d}" aria-pressed="${pick.days === d}">${plural(d, 'day')}</button>`)}</div></section>
      ${made && made.role === pick.role && made.days === pick.days ? html`
        <div class="qr"><img src="${made.qr}" alt="QR code of the invite link"></div>
        <p class="note" style="text-align:center">Scan with a phone camera · joins as ${Club.ROLE_NAMES[made.role].toLowerCase()} · until ${until}</p>
        <div class="btns">
          <a class="btn primary" href="https://wa.me/?text=${encodeURIComponent(made.text)}" target="_blank" rel="noopener">WhatsApp</a>
          ${navigator.share ? html`<button type="button" class="btn" data-share>Share…</button>` : ''}
          <button type="button" class="btn" data-copy>Copy link</button>
        </div>`
        : html`<button type="button" class="btn primary block" data-make ${busy ? 'disabled' : ''}>${busy ? 'Making the link…' : 'Make invite link'}</button>`}
      ${invites.length ? html`<section><h2 class="h3">Open links</h2><div class="card">
        ${[...invites].sort((a, b) => a.expiresAt.toMillis() - b.expiresAt.toMillis()).map((inv) => html`<div class="row">
          <span class="grow"><strong>${Club.ROLE_NAMES[inv.role]} link</strong><small>${daysLeft(inv.expiresAt)}</small></span>
          <button type="button" class="btn small danger" data-withdraw="${inv.id}">Withdraw</button></div>`)}
      </div></section>` : ''}
    </div>`.s;

    el.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => { pick.role = b.dataset.role; draw(v); }));
    el.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { pick.days = Number(b.dataset.days); draw(v); }));
    el.querySelector('[data-make]')?.addEventListener('click', () => make(v));
    el.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ title: `Join ${club.name}`, text: made.text }).catch(() => {}));
    el.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(made.link);
        toast('Link copied');
      } catch {
        toast(made.link);
      }
    });
    el.querySelectorAll('[data-withdraw]').forEach((b) => b.addEventListener('click', () => attempt(Club.deleteInvite(clubId, b.dataset.withdraw), 'Couldn’t withdraw the link')));
  }

  const top = (club) => html`<div class="top"><a class="back" href="#/club/${clubId}">${icon('back', 22)}${club.name}</a></div>`;

  async function make(v) {
    busy = true;
    draw(v);
    try {
      const token = await Club.createInvite(session.user, clubId, v.club.name, pick.role, pick.days);
      const link = Club.inviteLink(clubId, token);
      const qr = qrcode(0, 'M');
      qr.addData(link);
      qr.make();
      made = { link, role: pick.role, days: pick.days, qr: qr.createDataURL(6, 2), text: `Join ${v.club.name} on Skoor: ${link}` };
    } catch (e) {
      toast(`Couldn’t make the invite (${e.code || e.message})`);
    }
    busy = false;
    draw(v);
  }

  const screen = clubScreen(el, clubId, draw, { back: [`#/club/${clubId}`, 'Club'] });
  return screen.cleanup;
}

