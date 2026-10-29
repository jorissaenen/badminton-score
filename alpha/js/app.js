// Starts the app: the screens (Play, Clubs, You and the ones opened from them), the match, and
// what the app was opened for (an invite, a tapped reminder, a sign-in link).
import { watchLayout } from './layout.js';
import { setLanguage, onLanguage, translatePage } from './i18n.js';
import { state } from './state.js';
import { setupInstallPrompt } from './install.js';
import * as Board from './scoreboard.js';
import * as Session from './session.js';
import { takeFromAddress, watchTappedReminders } from './links.js';
import { $ } from './ui.js';
import { openMatchMenu } from './views/settings.js';
import * as Play from './views/play.js';
import * as NewMatch from './views/newmatch.js';
import * as You from './views/you.js';
import * as SignIn from './views/signin.js';
import * as Clubs from './views/clubs.js';
import * as ClubHome from './views/club.js';
import * as People from './views/people.js';
import * as Invite from './views/invite.js';
import * as ClubSettings from './views/clubsettings.js';
import * as Event from './views/event.js';
import * as EventEdit from './views/eventedit.js';
import * as Join from './views/join.js';

watchLayout();

// The language: picked in You, else the device's. Set before anything is drawn.
setLanguage(state.settings.language);
translatePage();

// Each route: a pattern for the address after '#', the screen, and the tab it belongs to (tabs
// show only on the main screen of each tab).
const ROUTES = [
  [/^\/play$/, Play, 'play'],
  [/^\/match\/new$/, NewMatch],
  [/^\/match$/, null],
  [/^\/clubs$/, Clubs, 'clubs'],
  [/^\/clubs\/new$/, Clubs.Create],
  [/^\/club\/(\w+)$/, ClubHome, 'clubs'],
  [/^\/club\/(\w+)\/people$/, People],
  [/^\/club\/(\w+)\/invite$/, Invite],
  [/^\/club\/(\w+)\/settings$/, ClubSettings],
  [/^\/club\/(\w+)\/plan$/, EventEdit],
  [/^\/club\/(\w+)\/event\/([\w-]+)$/, Event],
  [/^\/club\/(\w+)\/event\/([\w-]+)\/edit$/, EventEdit],
  [/^\/you$/, You, 'you'],
  [/^\/signin$/, SignIn],
  [/^\/join$/, Join],
];

let cleanup = null;
let current = null;

export function go(hash, { replace = false } = {}) {
  if (location.hash === hash) { route(); return; }
  if (replace) { history.replaceState(null, '', hash); route(); }
  else location.hash = hash;
}

function route() {
  const path = location.hash.replace(/^#/, '') || '/play';
  const match = ROUTES.map(([re, view, tab]) => ({ m: re.exec(path), view, tab })).find((r) => r.m);
  if (!match) { go('#/play', { replace: true }); return; }
  cleanup?.();
  cleanup = null;
  current = path;
  document.querySelectorAll('.sheet-host').forEach((s) => s.remove());

  if (!match.view) { // the match itself
    $('app').hidden = true;
    Board.show();
    return;
  }
  Board.hide();
  $('app').hidden = false;
  $('tabs').hidden = !match.tab;
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.tab === match.tab) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  const view = $('view');
  view.innerHTML = '';
  view.scrollTop = 0;
  cleanup = match.view.show(view, match.m.slice(1), { go, path }) ?? null;
}

window.addEventListener('hashchange', route);

// Another language picked: redraw everything in it.
onLanguage(() => {
  translatePage();
  Board.render();
  route();
});
export const currentPath = () => current;

// ---------- the match ----------

Board.init({
  onEnd: () => go('#/play'),
  onMenuOpen: () => openMatchMenu({ go }),
});

// ---------- signing in, invites and reminders ----------

const openSignIn = Session.boot();
const target = takeFromAddress();
if (openSignIn) history.replaceState(null, '', '#/signin');
else if (target) history.replaceState(null, '', target);
watchTappedReminders((hash) => go(hash));
route();

// ---------- install prompt (browser tabs only) ----------

setupInstallPrompt($('installSheet'), $('installTrigger'));

// ---------- offline support ----------

if ('serviceWorker' in navigator) {
  // When a newer version takes over from an older one, reload once so the new version shows
  // right away instead of on the next visit. The match is saved, so nothing is lost.
  const updating = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
