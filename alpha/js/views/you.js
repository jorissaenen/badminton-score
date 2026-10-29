// You: your account, reminders, sound, the remote, the screen, installing and the version.
import { EDITION } from '../edition.js';
import { isInstalled, installStatus } from '../install.js';
import { disableReminders, enableReminders, remindersState } from '../cloud.js';
import { session, onSession, start, signOut } from '../session.js';
import { state } from '../state.js';
import { mediaControlsSupported } from '../media.js';
import { speechSupported, onVoicesChanged } from '../audio.js';
import { $, html, icon, initials, toast, confirmSheet, raw } from '../ui.js';
import { toggle, wireToggles, voiceSheet, remoteSheet, voiceName, seconds, soundCheck, languageSheet } from './settings.js';
import { spinner } from './common.js';
import { burst, tapsCounter } from '../burst.js';
import { t, LANGUAGES, language } from '../i18n.js';

const REMINDER_STATES = ['on', 'off', 'blocked', 'install-first'];

export function show(el) {
  let version = '';
  let busy = false;

  function account() {
    if (!session.enabled) return '';
    const u = session.user;
    if (session.started && !session.ready) return html`<div class="card">${spinner()}</div>`;
    if (!u) {
      return html`<div class="card"><a class="row" href="#/signin"><span class="av">${icon('you', 18)}</span>
        <span class="grow"><strong>${t('signin.button')}</strong><small>${t('you.signInSub')}</small></span>${icon('chevron', 18)}</a></div>`;
    }
    const name = u.displayName || u.email;
    const how = u.providerData?.some((p) => p.providerId === 'google.com') ? t('you.withGoogle') : t('you.signedInAs', { email: u.email });
    const dot = session.conn.state === 'online' ? '' : session.conn.state;
    return html`<div class="card">
      <div class="row"><span class="av big me">${initials(name)}</span>
        <span class="grow"><strong style="font-size:17px">${name}</strong>
        <small><span class="dot ${dot}"></span> ${session.conn.state === 'online' ? t('you.online', { how }) : session.conn.text}</small></span>
        <button type="button" class="btn small" data-signout>${t('you.signOut')}</button></div>
      <div class="row" aria-disabled="true" style="opacity:.42">${icon('chart', 20)}<span class="grow"><strong>${t('you.profile')}</strong>
        <small>${t('play.later')}</small></span></div>
    </div>`;
  }

  function reminders() {
    if (!session.user) return '';
    const st = remindersState(isInstalled());
    if (!REMINDER_STATES.includes(st)) return '';
    const can = st === 'on' || st === 'off';
    return html`<section><h2 class="h3">${t('you.reminders')}</h2><div class="card">
      <label class="switch"><span>${t('you.remindersDevice')}<small>${t(`you.reminders.${st}`)}</small></span>
      <input type="checkbox" data-reminders ${st === 'on' ? 'checked' : ''} ${can && !busy ? '' : 'disabled'}></label></div></section>`;
  }

  function draw() {
    const s = state.settings;
    const install = installStatus();
    const canInstall = !$('installTrigger').hidden;
    el.innerHTML = html`<div class="page">
      <h1 class="title">${t('tab.you')}</h1>
      ${account()}
      ${session.message ? html`<p class="note">${session.message}</p>` : ''}
      ${reminders()}
      <section><h2 class="h3">${t('you.language')}</h2><div class="card">
        <button type="button" class="row" data-language><span class="grow">${t('you.language')}</span><span class="val">${s.language ? LANGUAGES[language()].name : t('you.languageAuto', { name: LANGUAGES[language()].name })}</span>${icon('chevron', 18)}</button>
      </div></section>
      <section><h2 class="h3">${t('you.sound')}</h2><div class="card">
        ${toggle('voice', t('settings.voice'), t('settings.voiceSub'))}
        ${toggle('beep', t('settings.beep'))}
        ${s.voice && speechSupported() ? html`<button type="button" class="row" data-voice><span class="grow">${t('settings.voiceName')}</span><span class="val">${voiceName()}</span>${icon('chevron', 18)}</button>` : ''}
        <button type="button" class="row" data-soundcheck><span class="grow">${t('soundCheck.title')}</span>${icon('chevron', 18)}</button>
      </div></section>
      <section><h2 class="h3">${t('you.remote')}</h2><div class="card">
        ${mediaControlsSupported() ? toggle('headphones', t('settings.headphones'), t('settings.headphonesSub')) : ''}
        ${toggle('screenRemote', t('settings.screenRemote'), t('settings.screenRemoteSub'))}
        <button type="button" class="row" data-remote><span class="grow">${t('you.timing')}</span><span class="val">${t('you.longPressValue', { s: seconds(s.longPressMs) })}</span>${icon('chevron', 18)}</button>
      </div></section>
      <section><h2 class="h3">${t('rules.match')}</h2><div class="card">
        ${toggle('intervals', t('settings.intervals'), t('settings.intervalsSub'))}
        ${toggle('autoEnds', t('settings.autoEnds'), t('settings.autoEndsSub'))}
        ${toggle('sleep', t('settings.sleep'), t('settings.sleepSub'))}
      </div></section>
      <section><h2 class="h3">${t('you.app')}</h2><div class="card">
        ${install.installed ? html`<div class="row"><span class="grow">${t('you.install')}</span><span class="val">${t('you.installed')}</span></div>`
          : html`<button type="button" class="row" data-install ${canInstall ? '' : raw('aria-disabled="true"')}>${icon('download', 20)}<span class="grow"><strong>${t('you.install')}</strong>
            <small>${canInstall ? t('you.installSub') : t('you.cantInstall')}</small></span></button>`}
        <button type="button" class="row" data-about style="cursor:default;user-select:none;-webkit-user-select:none"><span class="grow">${t('you.about')}</span><span class="val">Skoor ${EDITION.label}${version ? ` · ${version}` : ''}</span></button>
      </div>
      <p class="note">${aboutLine(install)}</p></section>
    </div>`.s;
    wireToggles(el);
    el.querySelectorAll('input[data-set="voice"]').forEach((i) => i.addEventListener('change', draw));
    el.querySelector('[data-voice]')?.addEventListener('click', () => voiceSheet(draw));
    // Five quick taps on About: every supported sport's icon bursts out of it.
    el.querySelector('[data-about]').addEventListener('click', aboutTaps);
    el.querySelector('[data-language]').addEventListener('click', () => languageSheet(draw));
    el.querySelector('[data-soundcheck]').addEventListener('click', soundCheck);
    el.querySelector('[data-remote]').addEventListener('click', () => remoteSheet(draw));
    el.querySelector('[data-install]')?.addEventListener('click', () => { if (canInstall) $('installTrigger').click(); });
    el.querySelector('[data-signout]')?.addEventListener('click', async () => {
      if (await confirmSheet(t('you.signOutQ'), t('you.signOutText'), t('you.signOut'))) signOut();
    });
    el.querySelector('[data-reminders]')?.addEventListener('change', async (e) => {
      busy = true;
      draw();
      try {
        if (e.target.checked) await enableReminders(session.user);
        else await disableReminders(session.user);
        toast(e.target.checked ? t('you.remindersOn') : t('you.remindersOff'));
      } catch (err) {
        toast(err.code === 'reminders/blocked' ? t('you.remindersBlocked') : t('you.remindersFailed', { error: err.code || err.message }));
      } finally {
        busy = false;
        draw();
      }
    });
  }

  const aboutTaps = tapsCounter(5, (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    burst(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
  });

  // Version and detection details, to help when something doesn't show up on a device.
  function aboutLine(s) {
    const where = s.installed ? t('you.installedApp') : t('you.browserTab');
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
