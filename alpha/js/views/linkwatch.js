// Opened by scanning a watch's QR code (…/?watch=<key>), or by typing its key under You → Watches:
// link that watch to your account. The watch then shows the matches of your clubs and scores them.
import * as Club from '../club.js';
import { session, onSession, start } from '../session.js';
import { html, icon, toast } from '../ui.js';
import { t } from '../i18n.js';
import { backBar, signInCard, spinner } from './common.js';

export function show(el, [key], { go }) {
  let link; // undefined: loading; null: unknown key
  let state = ''; // '', 'busy', 'done'
  let run = 0;

  function draw() {
    const u = session.user;
    const body = !session.ready && session.started ? spinner()
      : !u ? signInCard(t('watch.signIn'))
        : link === undefined ? spinner()
          : state === 'done' ? html`<div class="card pad" style="text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center">
              ${icon('check', 34)}<strong style="font-size:18px">${t('watch.linked')}</strong><p class="sheet-text" style="margin:0">${t('watch.linkedText')}</p></div>
              <a class="btn block" href="#/you">${t('watch.toYou')}</a>`
            : !link || link.expired || link.taken ? html`<div class="card"><p class="empty">${t('watch.unknownKey')}</p></div>`
              : html`<div class="card pad" style="display:flex;flex-direction:column;gap:6px">
                  <strong style="font-size:18px">${t('watch.linkQ', { model: link.model })}</strong>
                  <p class="sheet-text" style="margin:0">${t('watch.linkText', { name: u.displayName || u.email })}</p></div>
                <button type="button" class="btn primary block" data-link ${state === 'busy' ? 'disabled' : ''}>${t('watch.linkButton')}</button>`;
    el.innerHTML = html`<div class="page">
      ${backBar('#/you', t('tab.you'))}
      <h1 class="title">${t('watch.title')}</h1>
      <p class="sub">${t('watch.keyIs', { key: `${key.slice(0, 3)} ${key.slice(3)}` })}</p>
      ${body}
    </div>`.s;
    el.querySelector('[data-link]')?.addEventListener('click', async () => {
      state = 'busy';
      draw();
      try {
        await Club.confirmWatch(session.user, key);
        state = 'done';
      } catch (e) {
        state = '';
        toast(t('watch.linkFailed', { error: e.code || e.message }));
      }
      draw();
    });
  }

  async function load() {
    const mine = ++run;
    if (!session.user) { draw(); return; }
    link = await Club.watchLink(key).catch(() => null);
    if (mine === run) draw();
  }

  start();
  draw();
  load();
  const who = () => `${session.ready}:${session.user?.uid ?? ''}`;
  let last = who();
  const off = onSession(() => { if (who() !== last) { last = who(); load(); } });
  return () => { run += 1; off(); };
}
