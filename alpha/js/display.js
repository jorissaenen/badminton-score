// A screen at the venue (the /link page). It signs in anonymously and shows a key and QR code that
// change every minute, with a ring that empties until the next one. A score keeper, admin or owner
// links it to an event with that key (Event → Screens, or by scanning the QR code). Linked, it shows
// one court (or table) with its live match, or the overview of the event: every court, the
// statistics, the latest results and the pinned message. It can announce the score of its court.
// Not linked, it shows slides (advertising), with the key at the bottom.
import { cloud } from './cloud.js';
import * as Club from './club.js';
import * as M from './match.js';
import * as Audio from './audio.js';
import qrcode from './vendor/qrcode.js';
import { announcement } from './calls.js';
import { eventStats } from './stats.js';
import { sportOf, sportIcon } from './sports.js';
import { setLanguage, t } from './i18n.js';
import { html, raw, esc } from './ui.js';

setLanguage(''); // the screen's own language

const KEY_SECONDS = 60;
const $ = (id) => document.getElementById(id);
const root = $('screen');
const appUrl = location.href.replace(/link\/?(index\.html)?(\?.*)?(#.*)?$/, '');

// Slides while the screen isn't linked (or its court is free). Venues and sponsors can have their
// own later; for now Skoor's.
const SLIDES = [
  { title: 'slides.oneClickTitle', text: 'slides.oneClickText' },
  { title: 'slides.statsTitle', text: 'slides.statsText' },
  { title: 'slides.clubTitle', text: 'slides.clubText' },
];

let uid = null;
let key = null;
let keyAt = 0;
let link = null; // displays/{uid}, or null
let club = null;
let event = null;
let matches = [];
let stops = [];
let slide = 0;
let loaded = { event: false, matches: false }; // what it follows has come in at least once
let lastAnnounced = null; // { id, state } of the court's match, to know what changed
let soundOn = false;

// ---------- the key ----------

async function newKeyNow() {
  const { db, F } = await cloud();
  const previous = key;
  key = Club.newKey();
  keyAt = Date.now();
  await F.setDoc(F.doc(db, 'displayCodes', key), { display: uid, expiresAt: F.Timestamp.fromMillis(keyAt + KEY_SECONDS * 1000) });
  // The old key stays valid for 2 more minutes (someone may just have scanned it); then it goes.
  if (previous) setTimeout(() => F.deleteDoc(F.doc(db, 'displayCodes', previous)).catch(() => {}), 150_000);
  if (!link) draw();
}

function keyBlock(size = 'big') {
  if (!key) return html`<div class="key-block ${size}"><div class="spinner"></div></div>`;
  const url = `${appUrl}?display=${key}`;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return html`<div class="key-block ${size}">
    <div class="qr"><img src="${qr.createDataURL(8, 2)}" alt=""></div>
    <div class="key-text">
      <span class="key-label">${t('screen.linkThis')}</span>
      <span class="key-code display">${key.slice(0, 3)} ${key.slice(3)}<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-track"/><circle cx="18" cy="18" r="15" class="ring-left" id="ringLeft"/></svg></span>
      <span class="key-help">${t('screen.howToLink')}</span>
    </div></div>`;
}

// The ring empties as the key's minute runs out.
function tickRing() {
  const ring = $('ringLeft');
  if (ring) {
    const left = Math.max(0, 1 - (Date.now() - keyAt) / (KEY_SECONDS * 1000));
    const c = 2 * Math.PI * 15;
    ring.style.strokeDasharray = `${c}`;
    ring.style.strokeDashoffset = `${c * (1 - left)}`;
  }
  requestAnimationFrame(tickRing);
}

// ---------- drawing ----------

const names = (m) => [m.home, m.away].map((side) => side.map((p) => p.name).join(' & '));
const tiles = (text, on) => [...text].map((d) => html`<span class="tile${on ? ' on' : ''}"><span class="cap">${d}</span><span class="split"></span></span>`);

function slides() {
  const s = SLIDES[slide % SLIDES.length];
  return html`<div class="slide"><img class="logo" src="../icons/skoor-logo.svg" alt="Skoor"><h1>${t(s.title)}</h1><p>${t(s.text)}</p></div>`;
}

function drawUnlinked() {
  root.className = 'screen unlinked';
  root.innerHTML = html`<section class="slides">${slides()}</section><footer class="key-bar">${keyBlock('bar')}</footer>`.s;
}

// One court: its live match, big, as on the phone. Free: the last result and slides.
function drawCourt() {
  const live = matches.filter((m) => m.court === link.court && m.status === 'live').at(-1);
  const sport = sportOf(club?.sport);
  const label = t(sport.id === 'tabletennis' ? 'screen.tableN' : 'screen.courtN', { n: link.court });
  root.className = 'screen court';
  if (!live) {
    const last = matches.filter((m) => m.court === link.court && m.status === 'finished').at(-1);
    root.innerHTML = html`<header class="screen-top"><span class="display">${label}</span><span class="muted">${t('screen.free')}</span></header>
      ${last ? html`<div class="last-result"><span class="muted">${t('screen.lastMatch')}</span> <strong>${names(last)[0]}</strong> – <strong>${names(last)[1]}</strong>
        <span class="display">${M.gameScores(last.state, last.rules).map((s) => s.join('–')).join('  ')}</span></div>` : ''}
      <section class="slides">${slides()}</section>`.s;
    return;
  }
  const view = M.display(live.state, live.rules);
  const won = M.gamesWon(live.state, live.rules);
  const over = M.isGameOver(live.state, live.rules);
  const srv = M.server(M.currentGame(live.state), live.rules, live.state);
  const need = Math.ceil(live.rules.bestOf / 2);
  const n = names(live);
  const tennis = sportOf(live.rules.sport).scoring === 'tennis';
  const side = (s) => html`<section class="team${!over && srv === s ? ' serving' : ''}">
      <span class="team-name">${n[s]}</span>
      <span class="games">${live.rules.bestOf > 1 ? Array.from({ length: need }, (_, i) => html`<i class="${i < won[s] ? 'won' : ''}"></i>`) : ''}${view.games ? html`<b class="set-games">${t('board.gamesInSet', { n: view.games[s] })}</b>` : ''}</span>
      <div class="tiles">${tiles(view.tiles[s], !over && srv === s)}</div>
      <span class="serves">${t('board.serves')}</span></section>`;
  const title = view.tiebreak ? t('board.tiebreak') : t(tennis ? 'board.setN' : 'board.gameN', { n: live.state.games.length });
  root.innerHTML = html`<header class="screen-top"><span class="display">${label}</span><span class="display">${title.toUpperCase()}</span><span class="muted">${club?.name ?? ''}</span></header>
    <div class="sides">${side(0)}<div class="net"></div>${side(1)}</div>
    ${link.announce && !soundOn ? html`<button type="button" class="sound-on" data-sound>${t('screen.tapForSound')}</button>` : ''}`.s;
  root.querySelector('[data-sound]')?.addEventListener('click', () => { Audio.unlock(); Audio.keepOutputAwake(true); soundOn = true; draw(); });
}

// The whole event: every court, the pinned message, statistics and the latest results.
function drawOverview() {
  const courts = Math.max(1, event?.courts ?? 1);
  const sport = sportOf(club?.sport);
  const live = matches.filter((m) => m.status === 'live');
  const done = matches.filter((m) => m.status === 'finished');
  const stats = eventStats(matches).slice(0, 8);
  const court = (c) => {
    const m = live.filter((x) => x.court === c).at(-1);
    const label = t(sport.id === 'tabletennis' ? 'screen.tableN' : 'screen.courtN', { n: c });
    if (!m) return html`<div class="ov-court free"><span class="ov-label">${label}</span><span class="muted">${t('screen.free')}</span></div>`;
    const v = M.display(m.state, m.rules);
    const srv = M.server(M.currentGame(m.state), m.rules, m.state);
    const n = names(m);
    return html`<div class="ov-court"><span class="ov-label">${label}</span>
      ${[0, 1].map((s) => html`<div class="ov-side"><span class="ov-name${srv === s ? ' serving' : ''}">${n[s]}</span><span class="ov-tiles">${tiles(v.tiles[s], srv === s)}</span></div>`)}</div>`;
  };
  const noCourt = live.filter((m) => !m.court || m.court > courts);
  root.className = 'screen overview';
  root.innerHTML = html`<header class="screen-top"><span class="ov-title">${raw(sportIcon(sport.id, 28))}<span class="display">${club?.name ?? ''}</span></span>
      <span>${event ? `${t(`eventType.${event.type}`)} · ${event.start}–${event.end}` : ''}</span>${Club.eventPhase(event ?? {}, Date.now(), matches) === 'live' ? html`<span class="chip live">${t('event.live')}</span>` : ''}</header>
    ${event?.pinned ? html`<div class="pinned">${event.pinned}</div>` : ''}
    <div class="ov-grid">
      <section class="ov-courts">${Array.from({ length: courts }, (_, i) => court(i + 1))}
        ${noCourt.map((m) => html`<div class="ov-court"><span class="ov-label">${t('screen.noCourt')}</span>${names(m).map((x, s) => html`<div class="ov-side"><span class="ov-name">${x}</span><span class="ov-tiles">${tiles(M.display(m.state, m.rules).tiles[s], false)}</span></div>`)}</div>`)}</section>
      <aside class="ov-side-col">
        <section><h2 class="h3">${t('event.stats')}</h2>${stats.length ? html`<ol class="ov-stats">${stats.map((r) => html`<li><span>${r.name}</span><span class="display">${r.won}/${r.played}</span></li>`)}</ol>` : html`<p class="muted">${t('event.noMatchesYet')}</p>`}</section>
        <section><h2 class="h3">${t('screen.latest')}</h2>${done.length ? html`<ul class="ov-feed">${done.slice(-6).reverse().map((m) => html`<li><strong>${names(m)[m.winner ?? 0]}</strong> – ${names(m)[1 - (m.winner ?? 0)]}<span class="display">${M.gameScores(m.state, m.rules).map((s) => s.join('–')).join('  ')}</span></li>`)}</ul>` : html`<p class="muted">—</p>`}</section>
      </aside>
    </div>
    <footer class="ov-foot muted">skoor · ${esc(t('screen.overviewFoot'))}</footer>`.s;
}

function draw() {
  if (!link) drawUnlinked();
  else if (link.mode === 'court') drawCourt();
  else drawOverview();
}

// ---------- following what it's linked to ----------

function follow() {
  stops.forEach((s) => s());
  stops = [];
  matches = [];
  event = null;
  club = null;
  lastAnnounced = null;
  loaded = { event: false, matches: false };
  if (!link) { draw(); return; }
  cloud().then(({ db, F }) => {
    stops.push(F.onSnapshot(F.doc(db, 'clubs', link.clubId), (d) => { club = d.exists() ? d.data() : null; draw(); }, () => {}));
    stops.push(F.onSnapshot(F.doc(db, 'clubs', link.clubId, 'events', link.eventId), (d) => { event = d.exists() ? d.data() : null; loaded.event = true; draw(); }, () => {}));
    Club.watchEventMatches(link.clubId, link.eventId, (list) => { matches = list; loaded.matches = true; announce(); draw(); }).then((s) => stops.push(s));
  });
}

// Once the event is over (its end time has passed, the last match is finished and no new one
// started for a while) or gone, the screen unlinks itself and shows a key again, ready for the
// next club.
async function unlinkWhenOver() {
  if (!link || !loaded.event || (event && !loaded.matches)) return;
  if (event && !['ended', 'cancelled'].includes(Club.eventPhase(event, Date.now(), matches))) return;
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'displays', uid)).catch(() => {});
}
setInterval(unlinkWhenOver, 60_000);

// Announces the score of its court, when the club switched that on for this screen.
function announce() {
  if (link?.mode !== 'court') return;
  const m = matches.filter((x) => x.court === link.court && x.status !== 'stopped').at(-1);
  if (!m) return;
  const before = lastAnnounced?.id === m.id ? lastAnnounced.state : null;
  lastAnnounced = { id: m.id, state: m.state };
  if (!link.announce || !before) return;
  const text = announcement(before, m.state, m.rules, names(m));
  if (text) Audio.say(text);
}

// ---------- start ----------

async function start() {
  draw();
  const { auth, A, db, F } = await cloud();
  A.onAuthStateChanged(auth, async (user) => {
    if (!user) { A.signInAnonymously(auth).catch(() => { root.innerHTML = html`<p class="empty">${t('screen.cantStart')}</p>`.s; }); return; }
    uid = user.uid;
    await newKeyNow().catch(() => {});
    setInterval(() => newKeyNow().catch(() => {}), KEY_SECONDS * 1000);
    F.onSnapshot(F.doc(db, 'displays', uid), (d) => {
      const next = d.exists() ? d.data() : null;
      const moved = JSON.stringify([next?.clubId, next?.eventId]) !== JSON.stringify([link?.clubId, link?.eventId]);
      link = next;
      if (moved) follow();
      else draw();
    }, () => {});
    // Says it's still on, so the club sees which screens are alive.
    setInterval(() => { if (link) F.updateDoc(F.doc(db, 'displays', uid), { lastSeen: F.serverTimestamp() }).catch(() => {}); }, 5 * 60_000);
  });
}

setInterval(() => { slide += 1; if (!link || (link.mode === 'court' && !matches.some((m) => m.court === link.court && m.status === 'live'))) draw(); }, 12_000);
requestAnimationFrame(tickRing);
// Keep the screen on.
const wake = () => navigator.wakeLock?.request('screen').catch(() => {});
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
wake();
// Offline copy, as for the app.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
start();
