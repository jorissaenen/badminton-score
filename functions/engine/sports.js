// The sports Skoor supports: their icon (24×24, drawn in the current text colour) and how they
// count. A new sport is added here, with its name in the language files (sport.<id>); the
// scoreboard, New match, clubs and the easter egg in You → About pick it up.
//
// Two ways of counting:
// - 'rally': a game goes to `points` (win by 2, up to `cap` where the sport has one); a match is
//   best of `bestOf` games. Who serves, when ends change and the breaks differ per sport.
// - 'tennis': 15-30-40 games, sets of 6 games with a tiebreak at 6-6, best of `bestOf` sets;
//   optionally a golden point at deuce, and a match tiebreak (to 10) instead of a final set.

const ic = (paths) => `<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;

export const SPORTS = [
  {
    id: 'badminton',
    // Shuttlecock (Iconify, MIT).
    icon: '<g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="round" d="M3.927 4.38c1.086-.571 2.527-.851 3.968-.158c2.053-2.963 6.157-2.963 8.21 0c1.44-.693 2.882-.413 3.968.157c.502.264.753.396.881.773c.129.378-.024.697-.33 1.336l-4.407 9.206c-.209.435-.313.653-.361.855c-.049.202-.062.76-.089 1.877C15.722 20.353 14.48 22 12 22s-3.721-1.648-3.767-3.574c-.027-1.117-.04-1.675-.089-1.877s-.152-.42-.36-.855L3.375 6.488c-.306-.64-.459-.958-.33-1.336c.128-.377.379-.509.881-.773"/><path d="M8 17h8M8 4l3 13m5-13l-3 13m-7-5c1.2 1.333 2.8 1.333 4 0c1.2 1.333 2.8 1.333 4 0c1.2 1.333 2.8 1.333 4 0"/></g>',
    scoring: 'rally',
    points: [21, 15, 11],
    bestOf: [1, 3, 5],
    defaults: { points: 21, bestOf: 3 },
    cap: { 21: 30, 15: 20, 11: 15 }, // BWF: win by 2, but the game ends at the cap
    serve: 'winner', // the side that wins the rally serves
    nextFirst: 'winner', // the winner of a game serves first in the next
    ends: { afterGame: true, decider: 'ceil' }, // and at 11 (half, rounded up) in the deciding game
    breaks: { interval: 60, between: 120 }, // 60 s when the leader reaches 11, 2 min between games
  },
  {
    id: 'tabletennis',
    // A solid bat with a thick handle, and a ball.
    icon: ic('<circle cx="9.5" cy="9.5" r="7" fill="currentColor"/><path d="m14.6 14.6 5.4 5.4" stroke-width="3.4"/><circle cx="20" cy="4" r="2"/>'),
    scoring: 'rally',
    points: [11, 21],
    bestOf: [3, 5, 7],
    defaults: { points: 11, bestOf: 5 },
    serve: 'turns', // two serves each (five in a game to 21), one each from 10-10
    nextFirst: 'other', // who received first in a game serves first in the next
    ends: { afterGame: true, decider: 'floor' }, // and at 5 in the deciding game
    breaks: { between: 60 },
  },
  {
    id: 'squash',
    // A long strung racket head on a thin handle, and a ball.
    icon: ic('<ellipse cx="15" cy="8" rx="4.6" ry="6.6" transform="rotate(45 15 8)"/><path d="m11.4 12.6-8.4 8.4M13 6.2l4.8 4.8M15.4 3.8l4.8 4.8M11.6 9.4l3 3"/><circle cx="5" cy="6" r="1.8" fill="currentColor" stroke="none"/>'),
    scoring: 'rally',
    points: [11, 15],
    bestOf: [3, 5],
    defaults: { points: 11, bestOf: 5 },
    serve: 'winner',
    nextFirst: 'winner',
    ends: null, // one wall, no ends to change
    breaks: { between: 90 },
  },
  {
    id: 'pickleball',
    icon: ic('<rect x="3" y="2.5" width="11" height="13" rx="4.5"/><path d="M8.5 15.5V21"/><circle cx="18" cy="17" r="3.5"/><path d="M17 16h.01M19 18h.01"/>'),
    scoring: 'rally', // rally scoring, as in MLP; the older side-out scoring isn't supported
    points: [11, 15, 21],
    bestOf: [1, 3],
    defaults: { points: 11, bestOf: 3 },
    serve: 'winner',
    nextFirst: 'other',
    ends: { afterGame: true, decider: 'ceil' },
    breaks: { between: 120 },
  },
  {
    id: 'beachvolleyball',
    // Volleyball (Lucide, ISC).
    icon: ic('<circle cx="12" cy="12" r="10"/><path d="M11.1 7.1a16.55 16.55 0 0 1 10.9 4M12 12a12.6 12.6 0 0 1-8.7 5M16.8 13.6a16.55 16.55 0 0 1-9 7.5M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5"/>'),
    scoring: 'rally',
    points: [21, 15],
    bestOf: [1, 3],
    defaults: { points: 21, bestOf: 3 },
    deciderPoints: 15, // the third set goes to 15
    serve: 'winner',
    nextFirst: 'other',
    ends: { afterGame: true, every: 7, deciderEvery: 5 }, // every 7 points, every 5 in the third set
    breaks: { between: 60 },
  },
  {
    id: 'tennis',
    icon: ic('<circle cx="12" cy="12" r="9.5"/><path d="M5.3 5.3a9.5 9.5 0 0 1 0 13.4M18.7 5.3a9.5 9.5 0 0 0 0 13.4"/>'),
    scoring: 'tennis',
    bestOf: [1, 3, 5],
    defaults: { bestOf: 3, golden: false, matchTiebreak: false },
    breaks: { between: 120 }, // between sets
  },
  {
    id: 'padel',
    icon: ic('<path d="M12 2.5c3.9 0 6.5 2.6 6.5 6.3 0 3.4-2 5.7-4.4 6.7L13.3 21h-2.6l-.8-5.5C7.5 14.5 5.5 12.2 5.5 8.8 5.5 5.1 8.1 2.5 12 2.5Z"/><path d="M10 7h.01M14 7h.01M12 9.5h.01M10 12h.01M14 12h.01"/>'),
    scoring: 'tennis',
    bestOf: [1, 3],
    defaults: { bestOf: 3, golden: false, matchTiebreak: false },
    breaks: { between: 120 },
  },
];

export const DEFAULT_SPORT = 'badminton';
export const sportOf = (id) => SPORTS.find((s) => s.id === id) ?? SPORTS[0];
export const sportIcon = (id, size = 22) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${sportOf(id).icon}</svg>`;

// The rules of a match: the sport and its options, as stored with the match (plain data).
export function rulesFor(sport, options = {}) {
  const s = sportOf(sport);
  const o = { ...s.defaults, ...options };
  const bestOf = s.bestOf.includes(o.bestOf) ? o.bestOf : s.defaults.bestOf;
  if (s.scoring === 'tennis') return { sport: s.id, bestOf, golden: Boolean(o.golden), matchTiebreak: Boolean(o.matchTiebreak) };
  const points = s.points.includes(o.points) ? o.points : s.defaults.points;
  return { sport: s.id, points, cap: s.cap?.[points] ?? null, bestOf };
}
