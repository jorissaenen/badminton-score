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
import { sportOf } from './sports.js';
import { setLanguage, t } from './i18n.js';
import { html, raw } from './ui.js';

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
let lastNewest = null; // the newest result on the overview, to slide in the next one

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

// The top of every screen: who it's from (the Skoor logo; with a paid plan later the club's own,
// see the design board), what it shows, and LIVE.
const top = (title, right = '') => html`<header class="screen-top"><img class="screen-logo" src="../icons/skoor-logo.svg" alt="Skoor">
  <span class="display">${title}</span><span class="screen-right">${right}</span></header>`;
const liveChip = () => (event && Club.eventPhase(event, Date.now(), matches) === 'live' ? html`<span class="chip live">${t('event.live')}</span>` : '');

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
    root.innerHTML = html`${top(label, html`<span class="chip">${t('screen.free')}</span>`)}
      ${last ? lastResult(last) : ''}
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
  root.innerHTML = html`${top(`${label} · ${title}`, liveChip())}
    <div class="sides">${side(0)}<div class="net"></div>${side(1)}</div>
    ${link.announce && !soundOn ? html`<button type="button" class="sound-on" data-sound>${t('screen.tapForSound')}</button>` : ''}`.s;
  root.querySelector('[data-sound]')?.addEventListener('click', () => { Audio.unlock(); Audio.keepOutputAwake(true); soundOn = true; draw(); });
}

// The last match of a free court, as a small scoreboard: a row per side, a column per game; the
// winner of each game and of the match in white, the rest grey.
function lastResult(m) {
  const games = M.gameScores(m.state, m.rules);
  const row = (s) => html`<div class="lr-row${m.winner === s ? ' won' : ''}"><span class="lr-name">${names(m)[s]}</span>
    ${games.map((g) => html`<span class="lr-game display${g[s] > g[1 - s] ? ' won' : ''}">${g[s]}</span>`)}
    <span class="lr-mark" ${m.winner === s ? raw(`role="img" aria-label="${t('screen.won')}"`) : ''}>${m.winner === s ? raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>') : ''}</span></div>`;
  return html`<section class="last-result">
    <div class="lr-head"><span class="lr-name">${t('screen.lastMatch')}</span>${games.map((_, i) => html`<span class="lr-game">${i + 1}</span>`)}<span class="lr-mark"></span></div>
    <div class="lr-card">${row(0)}${row(1)}</div></section>`;
}

// The whole event: every court, the pinned message, statistics and the latest results.
function drawOverview() {
  const courts = Math.max(1, event?.courts ?? 1);
  const sport = sportOf(club?.sport);
  const live = matches.filter((m) => m.status === 'live');
  const done = matches.filter((m) => m.status === 'finished');
  const stats = eventStats(matches).slice(0, 10);
  const recent = done.slice().sort((a, b) => (b.finishedAt?.toMillis?.() ?? 0) - (a.finishedAt?.toMillis?.() ?? 0)).slice(0, 8);
  const word = (c) => (c ? t(sport.id === 'tabletennis' ? 'screen.tableN' : 'screen.courtN', { n: c }) : '');
  const at = (ts) => (ts?.toDate ? ts.toDate().toTimeString().slice(0, 5) : '');
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
  const newest = recent[0]?.id ?? null;
  root.innerHTML = html`${top(event ? `${t(`eventType.${event.type}`)} · ${event.start}–${event.end}` : '', liveChip())}
    ${event?.pinned ? html`<div class="pinned">${event.pinned}</div>` : ''}
    <div class="ov-grid">
      <section class="ov-courts">${Array.from({ length: courts }, (_, i) => court(i + 1))}
        ${noCourt.map((m) => html`<div class="ov-court"><span class="ov-label">${t('screen.noCourt')}</span>${names(m).map((x, s) => html`<div class="ov-side"><span class="ov-name">${x}</span><span class="ov-tiles">${tiles(M.display(m.state, m.rules).tiles[s], false)}</span></div>`)}</div>`)}</section>
      <aside class="ov-side-col">
        <section class="ov-card ov-stats-card"><div class="ov-stats-head"><span>${t('event.stats')}</span>${stats.length ? html`<span>${t('screen.wonCol')}</span><span>${t('screen.lostCol')}</span>` : ''}</div>
          ${stats.length ? html`<ol class="ov-stats">${stats.map((r) => html`<li><span class="ov-rank"></span><span class="ov-who">${r.name}</span><span class="ov-n">${r.won}</span><span class="ov-n lost">${r.lost}</span></li>`)}</ol>` : html`<p class="muted">${t('event.noMatchesYet')}</p>`}</section>
        <section class="ov-results"><h2 class="h3">${t('screen.latest')}</h2>
          ${recent.length ? recent.map((m) => resultCard(m, word(m.court), at(m.finishedAt))) : html`<p class="muted">—</p>`}</section>
      </aside>
    </div>
    <footer class="ov-foot muted">${t('screen.overviewFoot')}</footer>`.s;
  // A new result slides in at the top and pushes the others down.
  if (newest && lastNewest && newest !== lastNewest) root.querySelector('.ov-result')?.classList.add('arrive');
  lastNewest = newest;
  fitOverview();
}

// Shows only what fits: up to 10 players in the statistics (fewer when the screen is low, so the
// results keep room), then as many of the latest results as fit below.
function fitOverview() {
  const col = root.querySelector('.ov-side-col');
  if (!col) return;
  const bottom = col.getBoundingClientRect().bottom;
  const card = root.querySelector('.ov-stats-card');
  const half = col.getBoundingClientRect().top + col.clientHeight * 0.62;
  const rows = [...root.querySelectorAll('.ov-stats li')];
  while (rows.length > 3 && card.getBoundingClientRect().bottom > half) rows.pop().remove();
  root.querySelectorAll('.ov-result').forEach((r) => { if (r.getBoundingClientRect().bottom > bottom) r.remove(); });
}

// One finished match: where and when, then a row per side with its score in each game; who won
// each game and the match stands out.
function resultCard(m, where, when) {
  const games = M.gameScores(m.state, m.rules);
  const row = (s) => html`<div class="ov-r-row${m.winner === s ? ' won' : ''}"><span class="ov-who">${names(m)[s]}</span>
    ${games.map((g) => html`<span class="ov-g${g[s] > g[1 - s] ? ' won' : ''}">${g[s]}</span>`)}</div>`;
  return html`<div class="ov-card ov-result"><div class="ov-r-top"><span>${where}</span><span>${when}</span></div>
    ${row(0)}<span class="ov-vs">${t('screen.vs')}</span>${row(1)}</div>`;
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
