// Keeps a club match saved while it's scored: every change of the score on this device is written
// to the club (state.link says where), a moment after the last point. Firestore keeps the writes
// while offline and sends them when the connection is back.
import * as M from './match.js';
import * as Club from './club.js';
import { state, save, onChange } from './state.js';

let timer = null;
let sent = '';

async function send() {
  const { link, match, rules } = state;
  if (!link) return;
  const body = JSON.stringify(match);
  if (body === sent) return;
  const winner = M.isGameOver(match, rules) ? M.matchWinner(match, rules) : null;
  try {
    await Club.updateMatch(link.clubId, link.matchId, { state: match, status: winner !== null ? 'finished' : 'live', winner });
    sent = body;
  } catch { /* not allowed (any more) or no Firebase: the score stays on this device */ }
}

export function keepClubMatchSaved() {
  onChange(() => {
    if (!state.link) return;
    clearTimeout(timer);
    timer = setTimeout(send, 500);
  });
}

// The match is done with on this device (finished, or stopped): stop saving it here.
export async function unlink(status = null) {
  const link = state.link;
  if (!link) return;
  clearTimeout(timer);
  await send();
  if (status) await Club.updateMatch(link.clubId, link.matchId, { status }).catch(() => {});
  state.link = null;
  save();
}
