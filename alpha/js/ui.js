// Small helpers shared by the screens: safe HTML templates, icons, toasts, bottom sheets and
// confirmations. Screens are plain template strings; everything put into them goes through esc().
import { t, locale } from './i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// A piece of HTML that is already safe; html`` leaves it as it is.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

// Template tag: values are escaped, arrays are joined, Raw values and nested html`` pass as they are.
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += Array.isArray(v) ? v.map(part).join('') : part(v);
    out += strings[i + 1];
  });
  return raw(out);
}
const part = (v) => (v instanceof Raw ? v.s : v == null || v === false ? '' : esc(v));

export const $ = (id) => document.getElementById(id);

// Stroke icons (Lucide, ISC licence), drawn in the current text colour.
const ICONS = {
  back: '<path d="m15 6-6 6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  swap: '<path d="M4 7h16M16 3l4 4-4 4M20 17H4M8 21l-4-4 4-4"/>',
  swapv: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z" fill="currentColor"/>',
  clubs: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  you: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  court: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M12 5v14M4 12h16"/>',
  screen: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M9 21h6"/>',
  quick: '<path d="M7 4.5v15L19.5 12z" fill="currentColor" stroke="none"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  invite: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  courts: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 12h16M12 3v18"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/>',
  remote: '<path d="M10 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M7 5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zm5-2v2m-2 10v.01M10 18v.01m4-.01v.01M14 15v.01"/>',
  download: '<path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  // What someone may do in a club, as a badge on their picture.
  owner: '<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.67a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.67a1 1 0 0 0 1.52-.3z"/><path d="M5 21h14"/>',
  admin: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  keeper: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
};
export const icon = (name, size = 22) => raw(`<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`);

export function initials(name = '') {
  const words = String(name).replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase() || '?';
}

// Someone's picture (their photo, else their initials), with a badge for what they may do in the
// club: owner, admin or score keeper (members have none).
export const ROLE_BADGES = ['owner', 'admin', 'keeper'];
export function avatar(name, cls = '', { photo = null, role = null } = {}) {
  const face = photo
    ? html`<img class="av ${cls}" src="${photo}" alt="" referrerpolicy="no-referrer" loading="lazy">`
    : html`<span class="av ${cls}" aria-hidden="true">${initials(name)}</span>`;
  if (!ROLE_BADGES.includes(role)) return face;
  return html`<span class="av-wrap">${face}<span class="role-badge ${role}" role="img" aria-label="${t(`role.${role}`)}" title="${t(`role.${role}`)}">${icon(role, 11)}</span></span>`;
}

// ---------- toast ----------

let toastTimer = null;
export function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- bottom sheets ----------

// Opens a bottom sheet with the given HTML. `setup(el, close)` wires it up. Returns close().
export function sheet(content, setup = () => {}, { onClose } = {}) {
  const host = document.createElement('div');
  host.className = 'sheet-host';
  host.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><span class="grip" aria-hidden="true"></span>${content}</div>`;
  document.body.append(host);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    host.classList.add('closing');
    setTimeout(() => host.remove(), 180);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  host.addEventListener('click', (e) => { if (e.target === host) close(); });
  setup(host.querySelector('.sheet'), close);
  return close;
}

// A choice in a sheet: resolves to the chosen value, or null when dismissed.
export function choose(title, text, options) {
  return new Promise((resolve) => {
    let answered = false;
    sheet(html`<h2 class="sheet-title">${title}</h2>${text ? html`<p class="sheet-text">${text}</p>` : ''}
      <div class="sheet-buttons">${options.map((o, i) => html`<button type="button" class="btn ${o.style ?? 'outline'}" data-i="${i}">${o.label}</button>`)}</div>`.s,
    (el, close) => {
      el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
        answered = true;
        close();
        resolve(options[Number(b.dataset.i)].value);
      }));
    }, { onClose: () => { if (!answered) resolve(null); } });
  });
}

export const confirmSheet = (title, text, label, danger = false) =>
  choose(title, text, [{ label, value: true, style: danger ? 'danger' : 'primary' }, { label: t('common.cancel'), value: false }]).then(Boolean);

// Runs an action and reports a failure in a toast. Returns true when it worked.
export async function attempt(promise, failure) {
  try {
    await promise;
    return true;
  } catch (e) {
    toast(`${failure} (${e.code || e.message})`);
    return false;
  }
}

// ---------- dates ----------

export const dayText = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), opts);
export const longDay = (iso) => dayText(iso, { weekday: 'long', day: 'numeric', month: 'long' });
