// The Season section in settings (your seasons, joining with an invite, starting a season) and the
// Season window (invites, members and roles, players).
import { EDITION } from './edition.js';
import qrcode from './vendor/qrcode.js';
import * as Club from './club.js';

const CURRENT_KEY = `${EDITION.storageKey}-season`;
const JOIN_KEY = `${EDITION.storageKey}-join`;

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* only affects convenience */ }
}

function initials(name = '') {
  const words = name.split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase() || '?';
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function avatar(name, photoURL) {
  if (photoURL) {
    const img = el('img', { className: 'avatar', alt: '', referrerPolicy: 'no-referrer', src: photoURL });
    img.addEventListener('error', () => img.replaceWith(el('span', { className: 'avatar' }, initials(name))));
    return img;
  }
  return el('span', { className: 'avatar' }, initials(name));
}

const expiresText = (ts) => {
  const days = Math.round((ts.toMillis() - Date.now()) / 86400_000);
  return days >= 1 ? `${days} day${days === 1 ? '' : 's'} left` : 'expires today';
};

// account: from setupAccount; defaults(): the current points and match length for a new season.
export function setupSeason($, account, notify = () => {}, defaults = () => ({})) {
  const group = $('seasonGroup');
  if (!EDITION.firebase) return { refresh() {}, openedFromInvite: false };

  let seasons = [];
  let pendingJoin = null; // { seasonId, token, invite? }
  const status = (text) => { $('seasonStatus').textContent = text; };
  const user = () => account.user();

  // An invite link opened the app: remember it (it survives signing in, even by e-mail link) and
  // take the code out of the address.
  const fromLink = Club.parseJoin(location.search);
  if (fromLink) {
    store(JOIN_KEY, JSON.stringify(fromLink));
    history.replaceState(null, '', location.pathname);
  }
  try { pendingJoin = JSON.parse(stored(JOIN_KEY)); } catch { pendingJoin = null; }

  // ---------- the section in settings ----------

  async function refresh() {
    const u = user();
    group.hidden = !u && !pendingJoin;
    await showJoin();
    if (!u) {
      $('seasonPick').hidden = true;
      $('seasonNone').hidden = true;
      $('seasonNewBtn').hidden = true;
      $('seasonNew').hidden = true;
      return;
    }
    $('seasonNewBtn').hidden = !$('seasonNew').hidden || Boolean(pendingJoin);
    try {
      seasons = await Club.mySeasons(u);
    } catch {
      status('Can’t load your seasons right now (offline?).');
      return;
    }
    status('');
    const select = $('seasonSelect');
    select.replaceChildren(...seasons.map((s) => el('option', { value: s.id }, s.name)));
    const current = seasons.find((s) => s.id === stored(CURRENT_KEY)) ?? seasons[0];
    if (current) select.value = current.id;
    $('seasonPick').hidden = !seasons.length;
    $('seasonNone').hidden = Boolean(seasons.length) || Boolean(pendingJoin);
    showMyRole();
  }

  async function showMyRole() {
    const id = $('seasonSelect').value;
    if (!id) return;
    store(CURRENT_KEY, id);
    const role = await Club.myRoleIn(user(), id);
    $('seasonRole').textContent = role ? `You’re ${role === 'admin' || role === 'owner' ? 'an' : 'a'} ${Club.ROLE_NAMES[role].toLowerCase()} here.` : '';
  }
  $('seasonSelect').addEventListener('change', showMyRole);

  async function showJoin() {
    const card = $('joinCard');
    card.hidden = !pendingJoin;
    if (!pendingJoin) return;
    const u = user();
    $('joinBtn').hidden = !u;
    if (!u) {
      $('joinText').textContent = 'You’ve been invited to a season. Sign in above to join.';
      return;
    }
    const { seasonId, token } = pendingJoin;
    if (await Club.myRoleIn(u, seasonId)) {
      // Already a member: just make sure it's in the list, and select it.
      const invite = await Club.readInvite(seasonId, token).catch(() => null);
      await Club.rememberSeason(u, seasonId, invite?.seasonName ?? 'Season').catch(() => {});
      store(CURRENT_KEY, seasonId);
      clearJoin();
      notify('You’re already in this season');
      return;
    }
    let invite = null;
    try {
      invite = await Club.readInvite(seasonId, token);
    } catch {
      $('joinText').textContent = 'Can’t check the invite right now (offline?).';
      $('joinBtn').hidden = true;
      return;
    }
    if (!invite || invite.expired) {
      $('joinText').textContent = 'This invite link has expired or was withdrawn. Ask for a new one.';
      $('joinBtn').hidden = true;
      $('joinLaterBtn').textContent = 'OK';
      return;
    }
    pendingJoin.invite = invite;
    $('joinText').replaceChildren('You’re invited to ', el('strong', {}, invite.seasonName),
      ` as ${Club.ROLE_NAMES[invite.role].toLowerCase()}.`);
  }

  function clearJoin() {
    pendingJoin = null;
    store(JOIN_KEY, null);
    $('joinCard').hidden = true;
    $('joinLaterBtn').textContent = 'Not now';
  }

  $('joinBtn').addEventListener('click', async () => {
    const { seasonId, token, invite } = pendingJoin ?? {};
    if (!invite) return;
    $('joinBtn').disabled = true;
    try {
      await Club.join(user(), seasonId, token, invite);
      store(CURRENT_KEY, seasonId);
      clearJoin();
      notify(`Welcome to ${invite.seasonName}`);
      await refresh();
      openSeason(seasonId);
    } catch (e) {
      status(`Couldn’t join (${e.code || e.message}).`);
    } finally {
      $('joinBtn').disabled = false;
    }
  });
  $('joinLaterBtn').addEventListener('click', () => { clearJoin(); refresh(); });

  $('seasonNewBtn').addEventListener('click', () => {
    $('seasonNew').hidden = false;
    $('seasonNewBtn').hidden = true;
    $('seasonName').focus();
  });

  async function createSeason() {
    const name = $('seasonName').value.trim();
    if (!name) {
      status('Give the season a name first.');
      return;
    }
    $('seasonCreateBtn').disabled = true;
    try {
      const id = await Club.createSeason(user(), name, defaults());
      store(CURRENT_KEY, id);
      $('seasonName').value = '';
      $('seasonNew').hidden = true;
      await refresh();
      openSeason(id);
    } catch (e) {
      status(`Couldn’t create the season (${e.code || e.message}).`);
    } finally {
      $('seasonCreateBtn').disabled = false;
    }
  }
  $('seasonCreateBtn').addEventListener('click', createSeason);
  $('seasonName').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter would otherwise close the settings
    createSeason();
  });

  $('seasonOpenBtn').addEventListener('click', () => openSeason($('seasonSelect').value));

  account.onUserChange(() => refresh());

  // ---------- the Season window ----------

  const dialog = $('seasonDialog');
  let stopWatching = null;
  let view = null; // { id, season, members, players, invites, myRole }
  let lastInvite = null;
  const dstatus = (text) => { $('seasonDialogStatus').textContent = text; };

  async function act(promise, failure) {
    try {
      await promise;
      dstatus('');
    } catch (e) {
      dstatus(`${failure} (${e.code || e.message}).`);
    }
  }

  async function openSeason(id) {
    if (!id || !user()) return;
    stopWatching?.();
    view = { id, season: null, members: [], players: [], invites: [], myRole: await Club.myRoleIn(user(), id) };
    if (!view.myRole) {
      status('You’re no longer a member of this season.');
      await Club.forgetSeason(user(), id).catch(() => {});
      refresh();
      return;
    }
    lastInvite = null;
    $('inviteOut').hidden = true;
    dstatus('');
    stopWatching = await Club.watchSeason(id, Club.isAdmin(view.myRole), (state) => {
      Object.assign(view, state);
      view.myRole = view.members.find((m) => m.id === user()?.uid)?.role ?? view.myRole;
      render();
    }, () => dstatus('You no longer have access to this season.'));
    if (!dialog.open) dialog.showModal();
  }

  dialog.addEventListener('close', () => {
    stopWatching?.();
    stopWatching = null;
    refresh();
  });

  function render() {
    if (!view?.season) return;
    const { season, members, players, invites, myRole } = view;
    const me = user();
    const admin = Club.isAdmin(myRole);
    $('seasonTitle').textContent = season.name;
    $('seasonMyRole').textContent = Club.ROLE_NAMES[myRole] ?? '';
    // Keep the name in my own season list up to date after a rename.
    if (seasons.find((s) => s.id === view.id)?.name !== season.name) {
      Club.rememberSeason(me, view.id, season.name).catch(() => {});
    }

    // Invites
    $('inviteGroup').hidden = !admin;
    $('inviteList').replaceChildren(...invites
      .sort((a, b) => a.expiresAt.toMillis() - b.expiresAt.toMillis())
      .map((inv) => el('li', {},
        el('span', { className: 'who' }, `${Club.ROLE_NAMES[inv.role]} link`, el('small', {}, expiresText(inv.expiresAt))),
        el('button', {
          type: 'button', className: 'btn outline', textContent: 'Withdraw',
          onclick: () => act(Club.deleteInvite(view.id, inv.id), 'Couldn’t withdraw the link'),
        }))));

    // Members
    const order = (m) => -({ owner: 4, admin: 3, keeper: 2, member: 1 }[m.role] ?? 0);
    $('memberList').replaceChildren(...[...members]
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
      .map((m) => {
        const isSelf = m.id === me.uid;
        const roles = Club.assignableRoles(myRole, m.role, isSelf);
        const role = roles.length
          ? el('select', {
            ariaLabel: `Role of ${m.name}`,
            onchange: (e) => act(Club.setRole(view.id, m.id, e.target.value), 'Couldn’t change the role'),
          }, ...roles.map((r) => el('option', { value: r, selected: r === m.role }, Club.ROLE_NAMES[r])))
          : el('span', { className: 'role' }, Club.ROLE_NAMES[m.role]);
        const canRemove = !isSelf && (myRole === 'owner' || (admin && m.role !== 'owner'));
        return el('li', {}, avatar(m.name, m.photoURL),
          el('span', { className: 'who' }, m.name, isSelf ? el('small', {}, 'you') : null),
          role,
          canRemove ? el('button', {
            type: 'button', className: 'icon-x', textContent: '×', title: `Remove ${m.name}`,
            onclick: () => {
              if (confirm(`Remove ${m.name} from ${season.name}?`)) act(Club.removeMember(view.id, m.id), 'Couldn’t remove');
            },
          }) : null);
      }));

    // Players
    const mine = players.find((p) => p.uid === me.uid);
    $('claimHint').hidden = Boolean(mine) || !players.some((p) => !p.uid);
    $('addMeBtn').hidden = Boolean(mine);
    $('addGuestRow').hidden = !admin;
    $('playerList').replaceChildren(...[...players]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => el('li', {}, avatar(p.name, null),
        el('span', { className: 'who' }, p.name,
          p.uid === me.uid ? el('small', {}, 'you') : !p.uid ? el('small', {}, 'no account') : null),
        !p.uid && !mine ? el('button', {
          type: 'button', className: 'btn outline', textContent: 'That’s me',
          onclick: () => act(Club.claimPlayer(me, view.id, p.id), 'Couldn’t link this player to you'),
        }) : null,
        admin ? el('button', {
          type: 'button', className: 'icon-x', textContent: '×', title: `Remove ${p.name}`,
          onclick: () => {
            if (confirm(`Remove player ${p.name}?`)) act(Club.deletePlayer(view.id, p.id), 'Couldn’t remove');
          },
        }) : null)));

    // This season
    $('renameRow').hidden = !admin;
    if (document.activeElement !== $('seasonRename')) $('seasonRename').value = season.name;
    $('seasonLeaveBtn').hidden = myRole === 'owner';
    $('seasonDeleteBtn').hidden = myRole !== 'owner';
  }

  $('addMeBtn').addEventListener('click', () => {
    const me = user();
    const name = (me.displayName || me.email?.split('@')[0] || 'Me').slice(0, 40);
    act(Club.addPlayer(view.id, name, me.uid), 'Couldn’t add you');
  });

  function addGuest() {
    const name = $('guestName').value.trim();
    if (!name) return;
    $('guestName').value = '';
    act(Club.addPlayer(view.id, name), 'Couldn’t add the player');
  }
  $('addGuestBtn').addEventListener('click', addGuest);
  $('guestName').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addGuest();
  });

  $('seasonRenameBtn').addEventListener('click', () => {
    const name = $('seasonRename').value.trim();
    if (name) act(Club.renameSeason(user(), view.id, name), 'Couldn’t rename');
  });

  $('seasonLeaveBtn').addEventListener('click', async () => {
    if (!confirm(`Leave ${view.season.name}? You need a new invite to come back.`)) return;
    await act(Club.leave(user(), view.id), 'Couldn’t leave');
    store(CURRENT_KEY, null);
    dialog.close();
  });

  $('seasonDeleteBtn').addEventListener('click', async () => {
    const name = view.season.name;
    if (prompt(`This deletes ${name} for everyone: members, players and invites. Type the season’s name to confirm:`)?.trim() !== name) return;
    const id = view.id;
    stopWatching?.();
    stopWatching = null;
    await act(Club.deleteSeason(user(), id), 'Couldn’t delete the season');
    store(CURRENT_KEY, null);
    dialog.close();
    notify(`${name} deleted`);
  });

  // Invite link, QR code and sharing
  $('inviteCreateBtn').addEventListener('click', async () => {
    const role = $('inviteRole').value;
    const days = Number($('inviteDays').value);
    $('inviteCreateBtn').disabled = true;
    try {
      const token = await Club.createInvite(user(), view.id, view.season.name, role, days);
      const link = Club.inviteLink(view.id, token);
      lastInvite = { link, role, text: `Join ${view.season.name} on Badminton Score: ${link}` };
      const qr = qrcode(0, 'M');
      qr.addData(link);
      qr.make();
      $('inviteQr').src = qr.createDataURL(6, 2);
      $('inviteWhat').textContent = `Anyone with this link or QR code can join as ${Club.ROLE_NAMES[role].toLowerCase()} for ${days} day${days === 1 ? '' : 's'}. Scan it with a phone camera.`;
      $('inviteWhatsApp').href = `https://wa.me/?text=${encodeURIComponent(lastInvite.text)}`;
      $('inviteShareBtn').hidden = !navigator.share;
      $('inviteOut').hidden = false;
      dstatus('');
    } catch (e) {
      dstatus(`Couldn’t create the invite (${e.code || e.message}).`);
    } finally {
      $('inviteCreateBtn').disabled = false;
    }
  });

  $('inviteShareBtn').addEventListener('click', () => {
    navigator.share({ title: `Join ${view.season.name}`, text: lastInvite.text }).catch(() => {});
  });

  $('inviteCopyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lastInvite.link);
      dstatus('Link copied.');
    } catch {
      dstatus(lastInvite.link);
    }
  });

  return { refresh, openedFromInvite: Boolean(fromLink) };
}
