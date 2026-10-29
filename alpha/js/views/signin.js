// Sign in: with Google, or with a link by e-mail. In the installed iPhone app the e-mail link opens
// in Safari, so the link can be pasted here, or copied from Safari for the app.
import * as Session from '../session.js';
import { session, onSession, pendingEmail } from '../session.js';
import { pendingJoin } from '../links.js';
import { html, raw, icon } from '../ui.js';
import { backBar } from './common.js';

const GOOGLE = '<svg class="i" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6C43.9 38 46.5 31.8 46.5 24.5z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

export function show(el, _params, { go }) {
  let emailOpen = Session.linkPending();
  let typed = pendingEmail() ?? ''; // kept when the screen redraws
  let resendTimer = null;

  function done() {
    go(pendingJoin() ? '#/join' : '#/clubs', { replace: true });
  }

  function resendLabel() {
    const left = Math.ceil((Session.sentAt() + Session.RESEND_AFTER_MS - Date.now()) / 1000);
    if (left > 0 && left <= Session.RESEND_AFTER_MS / 1000) {
      clearTimeout(resendTimer);
      resendTimer = setTimeout(() => {
        const b = el.querySelector('[data-send]');
        if (b) { b.textContent = resendLabel().text; b.disabled = resendLabel().wait; }
      }, 1000);
      return { text: `Resend in ${left} s`, wait: true };
    }
    return { text: Session.linkPending() ? 'Resend link' : 'Send link', wait: false };
  }

  function draw() {
    if (session.user) { done(); return; }
    const message = session.message ? html`<p class="note" role="status">${session.message}</p>` : '';
    if (session.landingLink) {
      el.innerHTML = html`<div class="page">
        ${backBar('#/play', 'Play')}
        <h1 class="title">Sign in</h1>
        <p class="sub">This sign-in link was asked for somewhere else, probably in the installed app. Copy it and paste it there, or sign in here instead.</p>
        <button type="button" class="btn primary block" data-copy>Copy the link for the app</button>
        <label class="field">Or sign in here: your e-mail address<input type="email" data-landing-email autocomplete="email" placeholder="you@example.com"></label>
        <button type="button" class="btn block" data-here>Sign in here</button>
        ${message}</div>`.s;
      el.querySelector('[data-copy]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(session.landingLink);
          session.message = 'Link copied. Now open the app → You → Sign in, and paste it.';
        } catch {
          session.message = `Copy this link by hand: ${session.landingLink}`;
        }
        draw();
      });
      el.querySelector('[data-here]').addEventListener('click', () => {
        const email = el.querySelector('[data-landing-email]').value.trim();
        if (email) Session.signInWithLink(session.landingLink, email);
      });
      return;
    }
    const resend = resendLabel();
    el.innerHTML = html`<div class="page">
      ${backBar('#/you', 'You')}
      <img class="logo" src="icons/skoor-logo.svg" alt="Skoor" style="height:44px;margin:12px 4px 0">
      <p class="sub" style="font-size:16px;line-height:1.45">Keep score with one click: a camera remote, earbuds or a tap on the screen. Sign in to plan training with your club, see who’s coming and follow your results.</p>
      <button type="button" class="btn primary block" data-google>${raw(GOOGLE)}Continue with Google</button>
      ${emailOpen ? html`<div class="card pad" style="display:flex;flex-direction:column;gap:12px">
          <label class="field">E-mail address<input type="email" data-email autocomplete="email" placeholder="you@example.com" value="${typed}"></label>
          ${Session.linkPending() ? html`<p class="note" style="margin:0">✓ Sign-in link sent to ${pendingEmail()}. It may take a minute; check spam too.</p>` : ''}
          <button type="button" class="btn ${Session.linkPending() ? '' : 'primary'}" data-send ${resend.wait ? 'disabled' : ''}>${resend.text}</button>
          ${Session.needsPaste() ? html`<label class="field">Then paste the link from the e-mail here (press and hold it → Copy)
            <input type="url" data-paste autocomplete="off" placeholder="https://…"></label>` : ''}
        </div>`
        : html`<button type="button" class="btn block" data-open-email>${icon('invite', 20)}Sign in with e-mail</button>`}
      ${message}
      <a class="link-btn" href="#/play" style="text-align:center">Just score a match, no account</a>
    </div>`.s;
    el.querySelector('[data-google]').addEventListener('click', () => Session.google());
    el.querySelector('[data-open-email]')?.addEventListener('click', () => {
      emailOpen = true;
      draw();
      el.querySelector('[data-email]')?.focus();
    });
    const email = el.querySelector('[data-email]');
    email?.addEventListener('input', () => { typed = email.value; });
    const send = async () => {
      const b = el.querySelector('[data-send]');
      b.disabled = true;
      b.textContent = 'Sending…';
      await Session.sendLink(email.value.trim());
      draw();
    };
    el.querySelector('[data-send]')?.addEventListener('click', send);
    email?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    const paste = el.querySelector('[data-paste]');
    const pasted = () => { if (/oobCode=/.test(paste.value)) Session.pasteLink(paste.value.trim(), email?.value.trim()); };
    paste?.addEventListener('input', pasted); // signs in as soon as a link is pasted
    paste?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); Session.pasteLink(paste.value.trim(), email?.value.trim()); } });
  }

  Session.start();
  draw();
  let wasUser = Boolean(session.user);
  const off = onSession(() => {
    // Redraw only when something on this screen changes, so typing isn't interrupted.
    if (Boolean(session.user) !== wasUser || (el.querySelector('[role=status]')?.textContent ?? '') !== session.message) {
      wasUser = Boolean(session.user);
      draw();
    }
  });
  return () => { off(); clearTimeout(resendTimer); Session.clearMessage(); };
}
