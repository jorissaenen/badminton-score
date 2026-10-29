// You: your account, reminders, sound, the remote, the screen, installing and the version.
import { EDITION } from '../edition.js';
import { isInstalled, installStatus } from '../install.js';
import { disableReminders, enableReminders, remindersState } from '../cloud.js';
import { session, onSession, start, signOut } from '../session.js';
import { state } from '../state.js';
import { mediaControlsSupported } from '../media.js';
import { speechSupported, onVoicesChanged } from '../audio.js';
import { $, html, icon, initials, toast, confirmSheet } from '../ui.js';
import { toggle, wireToggles, voiceSheet, remoteSheet, voiceName, seconds } from './settings.js';
import { spinner } from './common.js';

const REMINDER_TEXT = {
  on: 'Before each event of your clubs',
  off: 'A notification before each event, e.g. the same morning for an evening training',
  blocked: 'Notifications are blocked for this app. Allow them in the phone’s settings first.',
  'install-first': 'On iPhone and iPad, only the installed app can show reminders. Install it first (below).',
};

export function show(el) {
  let version = '';
  let busy = false;

  function account() {
    if (!session.enabled) return '';
    const u = session.user;
    if (session.started && !session.ready) return html`<div class="card">${spinner()}</div>`;
    if (!u) {
      return html`<div class="card"><a class="row" href="#/signin"><span class="av">${icon('you', 18)}</span>
        <span class="grow"><strong>Sign in</strong><small>Plan training with your club, see who’s coming, follow your results</small></span>${icon('chevron', 18)}</a></div>`;
    }
    const name = u.displayName || u.email;
    const how = u.providerData?.some((p) => p.providerId === 'google.com') ? 'signed in with Google' : `signed in as ${u.email}`;
    const dot = session.conn.state === 'online' ? '' : session.conn.state;
    return html`<div class="card">
      <div class="row"><span class="av big me">${initials(name)}</span>
        <span class="grow"><strong style="font-size:17px">${name}</strong>
        <small><span class="dot ${dot}"></span> ${session.conn.state === 'online' ? `Online · ${how}` : session.conn.text}</small></span>
        <button type="button" class="btn small" data-signout>Sign out</button></div>
      <div class="row" aria-disabled="true" style="opacity:.42">${icon('chart', 20)}<span class="grow"><strong>Your profile and statistics</strong>
        <small>Comes with saved club matches, in a next version</small></span></div>
    </div>`;
  }

  function reminders() {
    if (!session.user) return '';
    const st = remindersState(isInstalled());
    if (!(st in REMINDER_TEXT)) return '';
    const can = st === 'on' || st === 'off';
    return html`<section><h2 class="h3">Reminders</h2><div class="card">
      <label class="switch"><span>Reminders on this device<small>${REMINDER_TEXT[st]}</small></span>
      <input type="checkbox" data-reminders ${st === 'on' ? 'checked' : ''} ${can && !busy ? '' : 'disabled'}></label></div></section>`;
  }

  function draw() {
    const s = state.settings;
    const install = installStatus();
    const canInstall = !$('installTrigger').hidden;
    el.innerHTML = html`<div class="page">
      <h1 class="title">You</h1>
      ${account()}
      ${session.message ? html`<p class="note">${session.message}</p>` : ''}
      ${reminders()}
      <section><h2 class="h3">Sound</h2><div class="card">
        ${toggle('voice', 'Score calls', '“11 9”, “Game, Home”')}
        ${toggle('beep', 'Beeps for remote presses')}
        ${s.voice && speechSupported() ? html`<button type="button" class="row" data-voice><span class="grow">Voice</span><span class="val">${voiceName()}</span>${icon('chevron', 18)}</button>` : ''}
      </div></section>
      <section><h2 class="h3">Remote control</h2><div class="card">
        ${mediaControlsSupported() ? toggle('headphones', 'Headphone controls', 'Earbuds or a watch as the remote') : ''}
        ${toggle('screenRemote', 'Use the screen as remote', 'A tap anywhere on the score is a click')}
        <button type="button" class="row" data-remote><span class="grow">Timing and tester</span><span class="val">Long press ${seconds(s.longPressMs)}</span>${icon('chevron', 18)}</button>
      </div></section>
      <section><h2 class="h3">Match</h2><div class="card">
        ${toggle('intervals', 'Intervals and breaks', '60 s at 11, 2 min between games')}
        ${toggle('autoEnds', 'Change ends automatically', 'After each game, and at 11 in the decider')}
        ${toggle('sleep', 'Screen sleep', 'Black after 30 s, back on at a press')}
      </div></section>
      <section><h2 class="h3">App</h2><div class="card">
        ${install.installed ? html`<div class="row"><span class="grow">Install as app</span><span class="val">Installed</span></div>`
          : html`<button type="button" class="row" data-install ${canInstall ? '' : 'aria-disabled="true"'}>${icon('download', 20)}<span class="grow"><strong>Install as app</strong>
            <small>${canInstall ? 'Full screen, offline, and the remote works best' : 'This browser can’t install apps; open the page in Safari or Chrome'}</small></span></button>`}
        <div class="row"><span class="grow">About</span><span class="val">Skoor ${EDITION.label}${version ? ` · ${version}` : ''}</span></div>
      </div>
      <p class="note">${aboutLine(install)}</p></section>
    </div>`.s;
    wireToggles(el);
    el.querySelectorAll('input[data-set="voice"]').forEach((i) => i.addEventListener('change', draw));
    el.querySelector('[data-voice]')?.addEventListener('click', () => voiceSheet(draw));
    el.querySelector('[data-remote]').addEventListener('click', () => remoteSheet(draw));
    el.querySelector('[data-install]')?.addEventListener('click', () => { if (canInstall) $('installTrigger').click(); });
    el.querySelector('[data-signout]')?.addEventListener('click', async () => {
      if (await confirmSheet('Sign out?', 'Scoring keeps working. Sign in again to see your clubs.', 'Sign out')) signOut();
    });
    el.querySelector('[data-reminders]')?.addEventListener('change', async (e) => {
      busy = true;
      draw();
      try {
        if (e.target.checked) await enableReminders(session.user);
        else await disableReminders(session.user);
        toast(e.target.checked ? 'Reminders on' : 'Reminders off');
      } catch (err) {
        toast(err.code === 'reminders/blocked' ? 'Reminders need permission for notifications' : `Couldn’t change reminders (${err.code || err.message})`);
      } finally {
        busy = false;
        draw();
      }
    });
  }

  // Version and detection details, to help when something doesn't show up on a device.
  function aboutLine(s) {
    const where = s.installed ? 'installed app' : 'browser tab';
    return `${s.platform?.os ?? '?'} / ${s.platform?.browser ?? '?'} · ${where}`;
  }

  (async () => {
    try {
      // The app's own offline copy is named after its version (other caches, like "pending", aren't).
      const versions = (await caches.keys()).filter((k) => k.startsWith(`${EDITION.cachePrefix}v`))
        .map((k) => k.replace(EDITION.cachePrefix, ''))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      version = versions.at(-1) ?? '';
      draw();
    } catch { /* caches unavailable */ }
  })();

  start(); // load sign-in only when someone looks at it
  draw();
  const off = onSession(draw);
  onVoicesChanged(() => { if (el.isConnected) draw(); });
  return off;
}
