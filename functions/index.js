// Cloud Functions. Deployed by GitHub Actions (.github/workflows/firebase.yml).
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { reminderDue, reminderText } from './reminders.js';
import { handle as handleWatch } from './watch.js';
import { wish } from './sportwish.js';

initializeApp();
const db = getFirestore();

// What watches talk to: linking a watch to an account, and following and scoring matches (see
// watch.js). Public: a watch has no Google sign-in; it proves who it is with its own key.
export const watch = onRequest({ region: 'europe-west1', invoker: 'public', cors: false }, async (req, res) => {
  try {
    const r = await handleWatch(db, { method: req.method, path: req.path, query: req.query, body: req.body, headers: req.headers });
    res.status(r.status).json(r.json);
  } catch (e) {
    logger.error('watch request failed', req.path, e);
    res.status(500).json({ error: 'server' });
  }
});

// "Your sport isn't here?": a wish for a sport, from the app or the website (see sportwish.js).
// Public, as people without an account can wish too; only the app's and the website's pages may
// call it from a browser.
export const sportWish = onRequest({
  // At most 2 servers of 20 wishes at a time: a flood of fake wishes gets "too busy" answers
  // instead of more servers (and a bigger bill). Scoring runs on its own function: never slowed.
  region: 'europe-west1', invoker: 'public', maxInstances: 2, concurrency: 20, memory: '256MiB', timeoutSeconds: 10,
  cors: [/^https:\/\/jorissaenen\.github\.io$/, /^https:\/\/(www\.)?skoor\.it$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
}, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'post only' }); return; }
  try {
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim();
    const r = await wish(db, req.body, ip);
    res.status(r.status).json(r.json);
  } catch (e) {
    logger.error('sport wish failed', e);
    res.status(500).json({ error: 'server' });
  }
});

// Every 15 minutes: send the reminders whose moment has come (each event has its own, set when it
// was planned: by default the same morning for an evening event, the evening before for a morning
// event), to every member's devices, except people who said they're not coming.
export const sendReminders = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west1', timeZone: 'Europe/Brussels', retryCount: 0 },
  async () => {
    const now = new Date();
    const snap = await db.collectionGroup('events')
      .where('remindAt', '<=', Timestamp.fromDate(now))
      .where('remindAt', '>', Timestamp.fromDate(new Date(now.getTime() - 7 * 86400_000)))
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const event = { ...data, startsAt: data.startsAt.toDate(), remindAt: data.remindAt.toDate() };
      if (!reminderDue(event, now)) continue;
      // Mark first, so an overlapping run can't send the same reminder twice.
      const marked = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (fresh.data().reminded) return false;
        tx.update(doc.ref, { reminded: true });
        return true;
      });
      if (marked) await remind(doc.ref, event, now).catch((e) => logger.error('reminder failed', doc.ref.path, e));
    }
  },
);

async function remind(eventRef, event, now) {
  const clubRef = eventRef.parent.parent;
  const [club, members, players, registrations] = await Promise.all([
    clubRef.get(),
    clubRef.collection('members').get(),
    clubRef.collection('players').get(),
    eventRef.collection('registrations').get(),
  ]);
  const answers = Object.fromEntries(registrations.docs.map((d) => [d.id, d.data().status]));
  const playerOf = Object.fromEntries(players.docs.filter((p) => p.data().uid).map((p) => [p.data().uid, p.id]));
  const clubName = club.data()?.name ?? 'Your club';
  const timeZone = club.data()?.timeZone ?? 'Europe/Brussels';

  const messages = [];
  const tokenRefs = [];
  for (const member of members.docs) {
    const text = reminderText(event, clubName, answers[playerOf[member.id]], now, timeZone);
    if (!text) continue;
    const devices = await db.collection('users').doc(member.id).collection('devices').get();
    for (const device of devices.docs) {
      const { token, app } = device.data();
      if (!token) continue;
      messages.push({
        token,
        data: {
          title: text.title,
          body: text.body,
          tag: `event-${eventRef.id}`,
          url: `${app}?event=${clubRef.id}.${eventRef.id}`,
        },
        webpush: { headers: { Urgency: 'high', TTL: String(3 * 3600) } },
      });
      tokenRefs.push(device.ref);
    }
  }
  if (!messages.length) return;

  const result = await getMessaging().sendEach(messages);
  // Forget devices whose app was uninstalled or whose permission was withdrawn.
  await Promise.all(result.responses.map((r, i) => (
    !r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']
      .includes(r.error?.code) ? tokenRefs[i].delete() : null
  )));
  await eventRef.update({ remindedAt: FieldValue.serverTimestamp() });
  logger.info('reminders sent', eventRef.path, `${result.successCount}/${messages.length}`);
}
