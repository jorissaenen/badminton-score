// Follows one club while one of its screens is open: the club, members, players, seasons and (for
// admins) invites. Handles signing in and losing access, so each club screen only draws.
import * as Club from '../club.js';
import { session, onSession, start } from '../session.js';
import { setLastClub } from '../links.js';
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { gate } from './clubs.js';
import { backBar, spinner } from './common.js';

// draw(view) is called whenever something changes; view = { id, club, members, players, seasons,
// invites, myRole, admin, me, myPlayer }. Returns the cleanup function.
export function clubScreen(el, clubId, draw, { back = ['#/clubs', t('tab.clubs')] } = {}) {
  let stop = null;
  let run = 0;
  let view = null;

  const plain = (body) => { el.innerHTML = html`<div class="page">${backBar(...back)}${body}</div>`.s; };

  async function follow() {
    const mine = ++run;
    stop?.();
    stop = null;
    view = null;
    const blocked = gate(t('club.signIn'));
    if (blocked) { plain(blocked); return; }
    plain(spinner());
    const u = session.user;
    const role = await Club.myRoleIn(u, clubId);
    if (mine !== run) return;
    if (!role) {
      await Club.forgetClub(u, clubId).catch(() => {});
      plain(html`<div class="card"><p class="empty">${t('club.notMember')}</p></div>`);
      return;
    }
    setLastClub(clubId);
    view = { id: clubId, myRole: role };
    const unsubscribe = await Club.watchClub(clubId, Club.isAdmin(role), (s) => {
      if (mine !== run || !s.club) return;
      Object.assign(view, s);
      view.myRole = s.members.find((m) => m.id === u.uid)?.role ?? view.myRole;
      view.admin = Club.isAdmin(view.myRole);
      view.me = u;
      view.myPlayer = s.players.find((p) => p.uid === u.uid) ?? null;
      draw(view);
    }, () => {
      if (mine === run) plain(html`<div class="card"><p class="empty">${t('club.noAccess')}</p></div>`);
    });
    if (mine !== run) unsubscribe();
    else stop = unsubscribe;
    // Keep the name in your own club list up to date after a rename.
    const known = (await Club.myClubs(u).catch(() => [])).find((c) => c.id === clubId);
    const sport = view?.club?.sport ?? 'badminton';
    if (view?.club && known && (known.name !== view.club.name || known.sport !== sport)) Club.rememberClub(u, clubId, view.club.name, sport).catch(() => {});
  }

  start();
  follow();
  // Follow again only when who is signed in changes (not at every connection change).
  const who = () => `${session.ready}:${session.user?.uid ?? ''}`;
  let last = who();
  const off = onSession(() => {
    if (who() === last) return;
    last = who();
    follow();
  });
  return {
    redraw: () => { if (view?.club) draw(view); },
    cleanup: () => { run += 1; off(); stop?.(); },
  };
}
