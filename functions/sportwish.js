// Sport wishes: "Your sport isn't here?" in the apps and on the website. Someone types the sport
// they'd like Skoor to count; the server cleans the name up, fixes typos and puts names for the
// same sport together (soccer = football = voetbal, ping pong = table tennis), and counts it. The
// owner's dashboard shows the most wished sports, per day, week and month, and where the wishes
// come from.
//
// Where: only the device's time zone (Europe/Brussels), which the app sends; it stands for a
// region, never a precise place. No IP address is kept: it is only mixed into a code for today's
// limit, which can't be turned back into the address after the day is over.
//
// Abuse: names are short plain words (no links), one wish per sport per device, at most 20
// wishes a day from one connection, and a hidden form field that only robots fill in.
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { SPORTS } from './engine/sports.js';

const { zones: ZONES, aliases: ZONE_ALIASES } = JSON.parse(readFileSync(new URL('./zones.json', import.meta.url), 'utf8'));
Object.assign(ZONE_ALIASES, {
  'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu',
  'Europe/Kiev': 'Europe/Kyiv', 'Asia/Rangoon': 'Asia/Yangon', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
});

export const PER_DAY = 20;
const ONCE_DAYS = 30;

// The sports people are likely to ask for, each with its names: English (UK and US), Dutch,
// French, German and common short forms. Typos are found by distance (see match()).
// [key, English name, Dutch name, other names…]
const KNOWN = [
  ['badminton', 'Badminton', 'Badminton', 'badmington', 'shuttle'],
  ['tabletennis', 'Table tennis', 'Tafeltennis', 'ping pong', 'pingpong', 'tennis de table', 'tischtennis'],
  ['squash', 'Squash', 'Squash'],
  ['pickleball', 'Pickleball', 'Pickleball'],
  ['beachvolleyball', 'Beach volleyball', 'Beachvolleybal', 'beach volley', 'beachvolley'],
  ['tennis', 'Tennis', 'Tennis', 'lawn tennis'],
  ['padel', 'Padel', 'Padel', 'paddle', 'padel tennis', 'paddle tennis'],
  ['basketball', 'Basketball', 'Basketbal', 'basket', 'hoops', '3x3 basketball', 'streetball'],
  ['football', 'Football', 'Voetbal', 'soccer', 'futbol', 'futebol', 'fussball', 'calcio', 'association football', 'footie', 'footy', 'voetbal 11'],
  ['futsal', 'Futsal', 'Zaalvoetbal', 'indoor football', 'indoor soccer', 'five a side', '5 a side', 'minivoetbal'],
  ['americanfootball', 'American football', 'American football', 'gridiron', 'nfl', 'football americain'],
  ['volleyball', 'Volleyball', 'Volleybal', 'volley', 'volley ball'],
  ['handball', 'Handball', 'Handbal'],
  ['hockey', 'Hockey', 'Hockey', 'field hockey', 'veldhockey', 'zaalhockey', 'indoor hockey'],
  ['icehockey', 'Ice hockey', 'IJshockey', 'ice hockey', 'eishockey', 'hockey sur glace'],
  ['floorball', 'Floorball', 'Floorball', 'unihockey', 'innebandy'],
  ['korfball', 'Korfball', 'Korfbal', 'korfbal'],
  ['netball', 'Netball', 'Netbal'],
  ['rugby', 'Rugby', 'Rugby', 'rugby union', 'rugby league', 'rugby sevens'],
  ['cricket', 'Cricket', 'Cricket'],
  ['baseball', 'Baseball', 'Honkbal', 'honkbal'],
  ['softball', 'Softball', 'Softbal'],
  ['waterpolo', 'Water polo', 'Waterpolo', 'water polo'],
  ['darts', 'Darts', 'Darts', 'dart', 'dartboard'],
  ['pool', 'Pool', 'Pool', 'billiards', 'billiard', 'biljart', 'eight ball', '8 ball', '9 ball'],
  ['snooker', 'Snooker', 'Snooker'],
  ['bowling', 'Bowling', 'Bowling', 'ten pin bowling', 'tenpin', 'kegelen'],
  ['petanque', 'Pétanque', 'Petanque', 'boules', 'jeu de boules', 'bocce', 'boccia', 'jeu de boule'],
  ['curling', 'Curling', 'Curling'],
  ['racquetball', 'Racquetball', 'Racquetball', 'racketball'],
  ['beachtennis', 'Beach tennis', 'Beachtennis'],
  ['teqball', 'Teqball', 'Teqball'],
  ['roundnet', 'Roundnet', 'Roundnet', 'spikeball'],
  ['ultimate', 'Ultimate frisbee', 'Ultimate frisbee', 'ultimate', 'frisbee'],
  ['lacrosse', 'Lacrosse', 'Lacrosse'],
  ['dodgeball', 'Dodgeball', 'Trefbal', 'trefbal', 'dodge ball'],
  ['kinball', 'Kin-ball', 'Kin-ball', 'kin ball'],
  ['sepaktakraw', 'Sepak takraw', 'Sepak takraw', 'takraw'],
  ['foosball', 'Table football', 'Tafelvoetbal', 'foosball', 'table soccer', 'kicker', 'baby foot', 'babyfoot'],
  ['airhockey', 'Air hockey', 'Airhockey'],
  ['cornhole', 'Cornhole', 'Cornhole', 'bean bag toss'],
  ['molkky', 'Mölkky', 'Mölkky', 'molkky', 'kubb'],
  ['fencing', 'Fencing', 'Schermen', 'schermen', 'escrime'],
  ['boxing', 'Boxing', 'Boksen', 'boksen'],
  ['judo', 'Judo', 'Judo'],
  ['wrestling', 'Wrestling', 'Worstelen', 'worstelen'],
  ['chess', 'Chess', 'Schaken', 'schaken', 'schaak'],
  ['golf', 'Golf', 'Golf'],
  ['discgolf', 'Disc golf', 'Discgolf', 'frisbee golf', 'frolf'],
  ['hurling', 'Hurling', 'Hurling', 'camogie'],
  ['gaelicfootball', 'Gaelic football', 'Gaelic football', 'gaelic', 'gaa'],
  ['australianfootball', 'Australian football', 'Australian football', 'aussie rules', 'afl'],
  ['jeudepaume', 'Real tennis', 'Kaatsen', 'kaatsen', 'court tennis', 'jeu de paume'],
];
const SUPPORTED = new Set(SPORTS.map((s) => s.id));

// "Ping-Pong!" → "ping pong"; "Pétanque" → "petanque". Letters, digits and single spaces only.
export function clean(name) {
  return String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
const squash = (s) => s.replace(/ /g, '');

// Every name, without spaces, with its sport.
const NAMES = new Map();
for (const [key, en, nl, ...more] of KNOWN) {
  for (const n of [key, en, nl, ...more]) NAMES.set(squash(clean(n)), key);
}
export const labelOf = (key) => {
  const k = KNOWN.find((x) => x[0] === key);
  return k ? { en: k[1], nl: k[2] } : null;
};

// How many letters differ (insert, delete, change, or swap two neighbours).
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// How many typos a name of this length may have and still be recognised.
const allowed = (n) => (n <= 4 ? 0 : n <= 6 ? 1 : n <= 10 ? 2 : 3);

// The closest of `names` (Map name → key) within the typos allowed, or null; a tie between two
// different sports is no match.
function closest(word, names) {
  let best = null;
  let bestD = Infinity;
  let tie = false;
  for (const [n, key] of names) {
    if (Math.abs(n.length - word.length) > 3) continue;
    // A typo hardly ever hits the first letter, and sports often differ only there (hurling, curling).
    if (n[0] !== word[0] && !(n[0] === word[1] && n[1] === word[0])) continue;
    const d = distance(word, n);
    if (d > allowed(Math.min(word.length, n.length))) continue;
    if (d < bestD) { best = key; bestD = d; tie = false; } else if (d === bestD && key !== best) tie = true;
  }
  return tie ? null : best;
}

// Which sport a typed name is: a known one ({ key, known: true }), one wished before
// (others: Map squashed name → key), or a new one ({ key: 'x-<name>', known: false }).
export function match(name, others = new Map()) {
  const c = clean(name);
  const s = squash(c);
  if (NAMES.has(s)) return { key: NAMES.get(s), known: true };
  // "football uk", "padel game": the known name without the extra words.
  const words = c.split(' ').filter((w) => !['sport', 'sports', 'game', 'games', 'the', 'de', 'het', 'een', 'a', 'an', 'uk', 'us', 'usa', 'spel', 'of', 'van', 'for', 'play', 'playing', 'spelen', 'please', 'graag'].includes(w));
  const core = words.join('');
  if (core && NAMES.has(core)) return { key: NAMES.get(core), known: true };
  if (others.has(core || s)) return { key: others.get(core || s), known: false };
  const known = closest(core || s, NAMES);
  if (known) return { key: known, known: true };
  const other = closest(core || s, others);
  if (other) return { key: other, known: false };
  return { key: `x-${(core || s).slice(0, 30)}`, known: false };
}

// Whether a typed name can be counted: 2 to 40 characters, letters in it, at most five words,
// no links or e-mail addresses, nothing that looks like code.
export function valid(name) {
  const raw = String(name ?? '').trim();
  if (raw.length < 2 || raw.length > 40) return false;
  if (/https?:|www\.|\.(com|net|org|be|nl|io|ru)\b|@|<|>|\{|\}|\\/i.test(raw)) return false;
  const c = clean(raw);
  if (!/[a-z]{2}/.test(c)) return false;
  return c.split(' ').length <= 5;
}

// The place a time zone stands for: { tz, country, lat, lng }, or {} for an unknown one.
export function place(tz) {
  const name = ZONE_ALIASES[tz] ?? tz;
  const z = typeof name === 'string' ? ZONES[name] : null;
  return z ? { tz: name, country: z[0], lat: z[1], lng: z[2] } : {};
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32);

// One wish. body: { sport (the typed name), device (a random id the app keeps), tz, lang,
// source ('app', 'web', 'watch'), website (the hidden field: empty for people) }. ip: the
// connection's address, only for today's limit. Answers { counted, key, label: { en, nl },
// supported } or { counted: false, reason: 'invalid' | 'limit' | 'again' }.
export async function wish(db, body, ip, now = Date.now()) {
  const typed = String(body?.sport ?? '');
  if (!valid(typed)) return { status: 400, json: { counted: false, reason: 'invalid' } };
  // A robot filled in the hidden field: it looks counted, but isn't.
  if (body?.website) return { status: 200, json: { counted: true, key: 'x', label: { en: typed, nl: typed }, supported: false } };

  const day = new Date(now).toISOString().slice(0, 10);
  const limitRef = db.doc(`sportWishLimits/${hash(`${ip}|${day}|skoor-wish`)}`);
  // Sports wished before, by their names, so that typos of a new sport end up together.
  const others = new Map();
  const custom = await db.collection('sportWishTotals').where('known', '==', false).limit(500).get();
  for (const d of custom.docs) for (const n of d.data().names ?? []) others.set(n, d.id);
  const m = match(typed, others);
  const label = m.known ? labelOf(m.key) : null;
  const device = String(body?.device ?? '').slice(0, 64);
  const onceRef = device ? db.doc(`sportWishOnce/${hash(`${device}|${m.key}`)}`) : null;
  const source = ['app', 'web', 'watch'].includes(body?.source) ? body.source : 'app';
  const lang = ['en', 'nl'].includes(body?.lang) ? body.lang : 'en';
  const where = place(String(body?.tz ?? ''));
  const shown = typed.trim().replace(/\s+/g, ' ').slice(0, 40);

  return db.runTransaction(async (tx) => {
    const [limit, once, total] = await Promise.all([
      tx.get(limitRef), onceRef ? tx.get(onceRef) : null, tx.get(db.doc(`sportWishTotals/${m.key}`)),
    ]);
    if ((limit.data()?.n ?? 0) >= PER_DAY) return { status: 429, json: { counted: false, reason: 'limit' } };
    const name = label ?? total.data()?.label ?? { en: shown, nl: shown };
    if (once?.exists && once.data().until.toMillis() > now) {
      return { status: 200, json: { counted: false, reason: 'again', key: m.key, label: name, supported: SUPPORTED.has(m.key) } };
    }
    const at = Timestamp.fromMillis(now);
    tx.set(limitRef, { n: (limit.data()?.n ?? 0) + 1, day, expiresAt: Timestamp.fromMillis(now + 2 * 86400_000) });
    if (onceRef) tx.set(onceRef, { until: Timestamp.fromMillis(now + ONCE_DAYS * 86400_000) });
    tx.set(db.collection('sportWishes').doc(), {
      key: m.key, typed: shown, known: m.known, source, lang, at, ...where,
    });
    const squashed = squash(clean(typed));
    const names = total.data()?.names ?? [];
    tx.set(db.doc(`sportWishTotals/${m.key}`), {
      key: m.key, known: m.known, label: name, count: FieldValue.increment(1), lastAt: at,
      ...(total.exists ? {} : { firstAt: at }),
      ...(!names.includes(squashed) && names.length < 30 ? { names: FieldValue.arrayUnion(squashed) } : {}),
    }, { merge: true });
    return { status: 200, json: { counted: true, key: m.key, label: name, supported: SUPPORTED.has(m.key) } };
  });
}
