// The Club section in settings (your clubs, joining with an invite, starting a club) and the
// Club window (invites, members and roles, players).
import { EDITION } from './edition.js';
import qrcode from './vendor/qrcode.js';
import * as Club from './club.js';
import { setupEvents } from './events-ui.js';
import { isInstalled } from './install.js';
import { disableReminders, enableReminders, remindersState } from './cloud.js';

const CURRENT_KEY = `${EDITION.storageKey}-club`;
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

const dateText = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const expiresText = (ts) => {
  const days = Math.round((ts.toMillis() - Date.now()) / 86400_000);
  return days >= 1 ? `${days} day${days === 1 ? '' : 's'} left` : 'expires today';
};

// account: from setupAccount; defaults(): the current points and match length for a new club.
export function setupClub($, account, notify = () => {}, defaults = () => ({}), openSettings = () => {}) {
  const group = $('clubGroup');
  if (!EDITION.firebase) return { refresh() {}, openedFromInvite: false };

  let clubs = [];
  let pendingJoin = null; // { clubId, token, invite? }
  const status = (text) => { $('clubStatus').textContent = text; };
  const user = () => account.user();

  // An invite link opened the app: remember it (it survives signing in, even by e-mail link) and
  // take the code out of the address.
  const fromLink = Club.parseJoin(location.search);
  if (fromLink) {
    store(JOIN_KEY, JSON.stringify(fromLink));
    history.replaceState(null, '', location.pathname);
  }
  try { pendingJoin = JSON.parse(stored(JOIN_KEY)); } catch { pendingJoin = null; }

  // A reminder was tapped: …/?event=<clubId>.<eventId> opens that event once signed in.
  const parseEventLink = (search) => {
    const m = /[?&]event=([A-Za-z0-9]+)\.([A-Za-z0-9_-]+)/.exec(search);
    return m ? { clubId: m[1], eventId: m[2] } : null;
  };
  const eventLink = parseEventLink(location.search);
  let pendingEvent = eventLink;
  if (eventLink) history.replaceState(null, '', location.pathname);

  // Tapped while the app was already open: the service worker passes the event's address here.
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type !== 'open') return;
    const target = parseEventLink(new URL(e.data.url, location.href).search);
    if (!target) return;
    openSettings();
    if (user()) events.openEvent(target.clubId, target.eventId);
    else pendingEvent = target; // opens once signed in
  });

  // ---------- the section in settings ----------

  async function refresh() {
    const u = user();
    group.hidden = !u && !pendingJoin;
    await showJoin();
    if (!u) {
      $('clubPick').hidden = true;
      $('clubNone').hidden = true;
      $('clubNewBtn').hidden = true;
      $('clubNew').hidden = true;
      return;
    }
    $('clubNewBtn').hidden = !$('clubNew').hidden || Boolean(pendingJoin);
    try {
      clubs = await Club.myClubs(u);
    } catch {
      status('Can’t load your clubs right now (offline?).');
      return;
    }
    status('');
    const select = $('clubSelect');
    select.replaceChildren(...clubs.map((s) => el('option', { value: s.id }, s.name)));
    const current = clubs.find((s) => s.id === stored(CURRENT_KEY)) ?? clubs[0];
    if (current) select.value = current.id;
    $('clubPick').hidden = !clubs.length;
    $('clubNone').hidden = Boolean(clubs.length) || Boolean(pendingJoin);
    showMyRole();
  }

  async function showMyRole() {
    const id = $('clubSelect').value;
    if (!id) return;
    store(CURRENT_KEY, id);
    events.refreshNext(id);
    showReminders();
    const role = await Club.myRoleIn(user(), id);
    $('clubRole').textContent = role ? `You’re ${role === 'admin' || role === 'owner' ? 'an' : 'a'} ${Club.ROLE_NAMES[role].toLowerCase()} here.` : '';
  }
  $('clubSelect').addEventListener('change', showMyRole);

  // Reminders before each event (when: set per event), on or off per device.
  const REMINDER_TEXT = {
    on: 'On for this device: a reminder before each event.',
    off: 'A notification before each event, e.g. the same morning for an evening training.',
    blocked: 'Notifications are blocked for this app. Allow them in the phone’s settings first.',
    'install-first': 'On iPhone and iPad, only the installed app can show reminders.',
  };
  function showReminders() {
    const state = remindersState(isInstalled());
    $('reminders').hidden = !(state in REMINDER_TEXT);
    $('remindersText').textContent = REMINDER_TEXT[state] ?? '';
    $('remindersBtn').hidden = state === 'blocked' || state === 'install-first';
    $('remindersBtn').textContent = state === 'on' ? 'Turn off' : 'Turn on';
  }
  $('remindersBtn').addEventListener('click', async () => {
    const on = remindersState(isInstalled()) === 'on';
    $('remindersBtn').disabled = true;
    try {
      if (on) await disableReminders(user());
      else await enableReminders(user());
      notify(on ? 'Reminders off' : 'Reminders on');
    } catch (e) {
      status(e.code === 'reminders/blocked' ? 'Reminders need permission for notifications.'
        : `Couldn’t change reminders (${e.code || e.message}).`);
    } finally {
      $('remindersBtn').disabled = false;
      showReminders();
    }
  });

  async function showJoin() {
    const card = $('joinCard');
    card.hidden = !pendingJoin;
    if (!pendingJoin) return;
    const u = user();
    $('joinBtn').hidden = !u;
    if (!u) {
      $('joinText').textContent = 'You’ve been invited to a club. Sign in above to join.';
      return;
    }
    const { clubId, token } = pendingJoin;
    if (await Club.myRoleIn(u, clubId)) {
      // Already a member: just make sure it's in the list, and select it.
      const invite = await Club.readInvite(clubId, token).catch(() => null);
      await Club.rememberClub(u, clubId, invite?.clubName ?? 'Club').catch(() => {});
      store(CURRENT_KEY, clubId);
      clearJoin();
      notify('You’re already in this club');
      return;
    }
    let invite = null;
    try {
      invite = await Club.readInvite(clubId, token);
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
    $('joinText').replaceChildren('You’re invited to ', el('strong', {}, invite.clubName),
      ` as ${Club.ROLE_NAMES[invite.role].toLowerCase()}.`);
  }

  function clearJoin() {
    pendingJoin = null;
    store(JOIN_KEY, null);
    $('joinCard').hidden = true;
    $('joinLaterBtn').textContent = 'Not now';
  }

  $('joinBtn').addEventListener('click', async () => {
    const { clubId, token, invite } = pendingJoin ?? {};
    if (!invite) return;
    $('joinBtn').disabled = true;
    try {
      await Club.join(user(), clubId, token, invite);
      store(CURRENT_KEY, clubId);
      clearJoin();
      notify(`Welcome to ${invite.clubName}`);
      await refresh();
      openClub(clubId);
    } catch (e) {
      status(`Couldn’t join (${e.code || e.message}).`);
    } finally {
      $('joinBtn').disabled = false;
    }
  });
  $('joinLaterBtn').addEventListener('click', () => { clearJoin(); refresh(); });

  $('clubNewBtn').addEventListener('click', () => {
    $('clubNew').hidden = false;
    $('clubNewBtn').hidden = true;
    $('clubName').focus();
  });

  async function createClub() {
    const name = $('clubName').value.trim();
    if (!name) {
      status('Give the club a name first.');
      return;
    }
    $('clubCreateBtn').disabled = true;
    try {
      const id = await Club.createClub(user(), name, defaults());
      store(CURRENT_KEY, id);
      $('clubName').value = '';
      $('clubNew').hidden = true;
      await refresh();
      openClub(id);
    } catch (e) {
      status(`Couldn’t create the club (${e.code || e.message}).`);
    } finally {
      $('clubCreateBtn').disabled = false;
    }
  }
  $('clubCreateBtn').addEventListener('click', createClub);
  $('clubName').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter would otherwise close the settings
    createClub();
  });

  $('clubOpenBtn').addEventListener('click', () => openClub($('clubSelect').value));

  account.onUserChange((u) => {
    refresh();
    if (u && pendingEvent) {
      const { clubId, eventId } = pendingEvent;
      pendingEvent = null;
      events.openEvent(clubId, eventId);
    }
  });

  // ---------- the Club window ----------

  const dialog = $('clubDialog');
  let stopWatching = null;
  let view = null; // { id, club, members, players, invites, myRole }
  let lastInvite = null;
  const dstatus = (text) => { $('clubDialogStatus').textContent = text; };

  async function act(promise, failure) {
    try {
      await promise;
      dstatus('');
    } catch (e) {
      dstatus(`${failure} (${e.code || e.message}).`);
    }
  }

  async function openClub(id) {
    if (!id || !user()) return;
    stopWatching?.();
    view = { id, club: null, members: [], seasons: [], players: [], invites: [], myRole: await Club.myRoleIn(user(), id) };
    if (!view.myRole) {
      status('You’re no longer a member of this club.');
      await Club.forgetClub(user(), id).catch(() => {});
      refresh();
      return;
    }
    lastInvite = null;
    editingSeason = null;
    $('seasonForm').hidden = true;
    $('inviteOut').hidden = true;
    dstatus('');
    events.watch(id);
    stopWatching = await Club.watchClub(id, Club.isAdmin(view.myRole), (state) => {
      Object.assign(view, state);
      view.myRole = view.members.find((m) => m.id === user()?.uid)?.role ?? view.myRole;
      render();
    }, () => dstatus('You no longer have access to this club.'));
    if (!dialog.open) dialog.showModal();
  }

  dialog.addEventListener('close', () => {
    stopWatching?.();
    stopWatching = null;
    events.stop();
    refresh();
  });

  const events = setupEvents($, {
    user,
    notify,
    club: () => (dialog.open && view?.club ? view : null),
  });

  function render() {
    if (!view?.club) return;
    const { club, members, seasons, players, invites, myRole } = view;
    const me = user();
    const admin = Club.isAdmin(myRole);
    $('clubTitle').textContent = club.name;
    $('clubMyRole').textContent = Club.ROLE_NAMES[myRole] ?? '';
    // Keep the name in my own club list up to date after a rename.
    if (clubs.find((s) => s.id === view.id)?.name !== club.name) {
      Club.rememberClub(me, view.id, club.name).catch(() => {});
    }

    // Seasons
    const now = Club.currentSeason(seasons);
    $('noSeasons').hidden = seasons.length > 0;
    $('seasonAddBtn').hidden = !admin || !$('seasonForm').hidden;
    $('seasonList').replaceChildren(...seasons.map((se) => el('li', {},
      el('span', { className: 'who two-line' }, se.name,
        el('small', {}, `${dateText(se.start)} – ${dateText(se.end)}`,
          se.id === now?.id ? el('span', { className: 'now' }, ' \u00b7 current') : null)),
      admin ? el('button', {
        type: 'button', className: 'btn outline', textContent: 'Edit', onclick: () => editSeason(se),
      }) : null,
      admin ? el('button', {
        type: 'button', className: 'icon-x', textContent: '\u00d7', title: `Delete ${se.name}`,
        onclick: () => {
          if (confirm(`Delete season ${se.name}?`)) act(Club.deleteSeason(view.id, se.id), 'Couldn’t delete the season');
        },
      }) : null)));

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
              if (confirm(`Remove ${m.name} from ${club.name}?`)) act(Club.removeMember(view.id, m.id), 'Couldn’t remove');
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

    // This club
    $('renameRow').hidden = !admin;
    if (document.activeElement !== $('clubRename')) $('clubRename').value = club.name;
    $('clubLeaveBtn').hidden = myRole === 'owner';
    events.render();
    $('clubDeleteBtn').hidden = myRole !== 'owner';
  }

  // Adding or editing a season (admins)
  let editingSeason = null;
  function editSeason(se) {
    editingSeason = se;
    const values = se ?? Club.nextSeasonSuggestion(view.seasons);
    $('seasonName').value = values.name;
    $('seasonStart').value = values.start;
    $('seasonEnd').value = values.end;
    $('seasonSaveBtn').textContent = se ? 'Save' : 'Add season';
    $('seasonForm').hidden = false;
    $('seasonAddBtn').hidden = true;
  }
  function closeSeasonForm() {
    editingSeason = null;
    $('seasonForm').hidden = true;
    render();
  }
  $('seasonAddBtn').addEventListener('click', () => editSeason(null));
  $('seasonCancelBtn').addEventListener('click', closeSeasonForm);
  $('seasonSaveBtn').addEventListener('click', async () => {
    const name = $('seasonName').value.trim();
    const start = $('seasonStart').value;
    const end = $('seasonEnd').value;
    if (!name || !start || !end) {
      dstatus('Give the season a name, a start and an end date.');
      return;
    }
    if (end < start) {
      dstatus('The season has to end after it starts.');
      return;
    }
    await act(editingSeason
      ? Club.updateSeason(view.id, editingSeason.id, { name, start, end })
      : Club.addSeason(view.id, name, start, end), 'Couldn’t save the season');
    closeSeasonForm();
  });

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

  $('clubRenameBtn').addEventListener('click', () => {
    const name = $('clubRename').value.trim();
    if (name) act(Club.renameClub(user(), view.id, name), 'Couldn’t rename');
  });

  $('clubLeaveBtn').addEventListener('click', async () => {
    if (!confirm(`Leave ${view.club.name}? You need a new invite to come back.`)) return;
    await act(Club.leave(user(), view.id), 'Couldn’t leave');
    store(CURRENT_KEY, null);
    dialog.close();
  });

  $('clubDeleteBtn').addEventListener('click', async () => {
    const name = view.club.name;
    if (prompt(`This deletes ${name} for everyone: members, seasons, players and invites. Type the club’s name to confirm:`)?.trim() !== name) return;
    const id = view.id;
    stopWatching?.();
    stopWatching = null;
    await act(Club.deleteClub(user(), id), 'Couldn’t delete the club');
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
      const token = await Club.createInvite(user(), view.id, view.club.name, role, days);
      const link = Club.inviteLink(view.id, token);
      lastInvite = { link, role, text: `Join ${view.club.name} on Badminton Score: ${link}` };
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
    navigator.share({ title: `Join ${view.club.name}`, text: lastInvite.text }).catch(() => {});
  });

  $('inviteCopyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lastInvite.link);
      dstatus('Link copied.');
    } catch {
      dstatus(lastInvite.link);
    }
  });

  return { refresh, openedFromInvite: Boolean(fromLink || eventLink) };
}
