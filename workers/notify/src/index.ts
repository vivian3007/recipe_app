// Sends Weekmenu's push notifications and allows uploading photos.
// - Every hour (cron in wrangler.toml): reminds whoever chooses the coming week, from the set number
//   of days before the shopping day, every day at the set hour until the week is ready. Each
//   reminder goes out once, so extra runs do no harm.
// - POST /ready {"weekStart": "YYYY-MM-DD"}: called by the app (signed in) when the week is ready;
//   marks it ready and tells the shoppers.
// - POST /photo {"householdId": "..."}: permission for the app to put one photo in Cloudinary.
// Deploy: npx wrangler deploy. Secrets (npx wrangler secret put ...): see wrangler.toml.
import { firestore, verifiedUser, type Config, type Row } from './firestore.ts';
import { encrypt, vapidHeader } from './webpush.ts';

export type Env = Config & {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
};

type Db = ReturnType<typeof firestore>;
type Message = { title: string; body: string; url: string; weekStart: string };

const TIME_ZONE = 'Europe/Amsterdam';
const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ---------- Dates (YYYY-MM-DD, Monday = 0) ----------

export function amsterdamNow(at = new Date()): { today: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, days: number) => fromDate(new Date(toDate(s).getTime() + days * 86_400_000));
const weekdayOf = (s: string) => (toDate(s).getUTCDay() + 6) % 7;
const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);

/** First day (the shopping day) of the week containing `s`. */
const weekStartOf = (s: string, shoppingDay: number) => addDays(s, -((weekdayOf(s) - shoppingDay + 7) % 7));

/** "maandag 12 okt" */
function dayLabel(s: string) {
  const d = toDate(s);
  const month = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getUTCMonth()];
  return `${WEEKDAYS[weekdayOf(s)]} ${d.getUTCDate()} ${month}`;
}

// ---------- Who chooses (as in src/lib/members.ts) ----------

async function choosersOf(db: Db, h: Row, weekStart: string, planExists: boolean): Promise<string[]> {
  const members = await db.where('profiles', 'household_id', h.id);
  const memberIds = new Set(members.map((m) => m.id));
  const rotation = ((h.chooser_rotation ?? []) as string[]).filter((id) => memberIds.has(id));
  let turn: string | null = null;
  if (rotation.length && h.rotation_start) {
    // The rotation's start week may be from before the shopping day changed: take its middle.
    const start = weekStartOf(addDays(h.rotation_start, 3), h.shopping_day ?? 0);
    const weeks = Math.round(daysBetween(start, weekStart) / 7);
    turn = rotation[((weeks % rotation.length) + rotation.length) % rotation.length];
  }
  const perDay: (string | null)[] = Array(7).fill(turn);
  if (planExists) {
    const overrides = await db.where(`households/${h.id}/choosers`, 'week_plan_id', weekStart);
    for (const o of overrides) perDay[o.day as number] = o.chooser_id as string | null;
  }
  return [...new Set(perDay.filter((id): id is string => !!id && memberIds.has(id)))];
}

// ---------- Sending ----------

async function send(env: Env, db: Db, userIds: string[], message: Message): Promise<number> {
  if (!userIds.length) return 0;
  // A family is far smaller than the 30 values Firestore allows here.
  const tokens = await db.where('pushTokens', 'user_id', userIds);
  let sent = 0;
  const gone: Row[] = [];

  const expo = tokens.filter((t) => t.kind === 'expo');
  if (expo.length) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        expo.map((t) => ({
          to: t.token,
          title: message.title,
          body: message.body,
          data: { url: message.url, weekStart: message.weekStart },
          sound: 'default',
          channelId: 'default',
        })),
      ),
    });
    const result = (await response.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    (result?.data ?? []).forEach((ticket, i) => {
      if (ticket.status === 'ok') sent++;
      else if (ticket.details?.error === 'DeviceNotRegistered') gone.push(expo[i]);
    });
  }

  const web = tokens.filter((t) => t.kind === 'web' && t.subscription);
  if (web.length && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    await Promise.all(
      web.map(async (t) => {
        try {
          const { endpoint, keys } = t.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              TTL: '86400',
              Authorization: await vapidHeader(endpoint, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!, 'https://weekmenu.expo.app'),
            },
            body: await encrypt(JSON.stringify(message), keys.p256dh, keys.auth),
          });
          if (response.ok) sent++;
          // The browser unsubscribed (or the app was removed from the home screen).
          else if (response.status === 404 || response.status === 410) gone.push(t);
        } catch {
          // This one didn't work; the others still go out.
        }
      }),
    );
  }

  await Promise.all(gone.map((t) => db.remove(`pushTokens/${t.id}`)));
  return sent;
}

// ---------- Reminders for whoever chooses ----------

export async function sendReminders(env: Env, at = new Date()) {
  const db = firestore(env);
  const { today, hour } = amsterdamNow(at);
  const households = await db.where('households');
  let reminded = 0;
  for (const h of households) {
    if (hour !== (h.remind_hour ?? 9)) continue;
    const shoppingDay = h.shopping_day ?? 0;
    // The coming week starts on the next shopping day after today.
    const weekStart = addDays(today, ((shoppingDay - weekdayOf(today) + 7) % 7) || 7);
    const daysLeft = daysBetween(today, weekStart);
    if (daysLeft > (h.remind_days_before ?? 2)) continue;

    const plan = await db.get(`households/${h.id}/weekPlans/${weekStart}`);
    if (plan?.ready_at) continue;
    const choosers = await choosersOf(db, h, weekStart, !!plan);
    if (!choosers.length) continue;

    // Once a day per week, also when this runs more than once in the hour.
    const first = await db.createOnce(`households/${h.id}/remindersSent`, `${weekStart}_${today}`, {
      week_start: weekStart,
      sent_on: today,
    });
    if (!first) continue;

    const when = daysLeft === 0 ? 'Vandaag' : daysLeft === 1 ? 'Morgen' : `Over ${daysLeft} dagen`;
    reminded += await send(env, db, choosers, {
      title: 'Kies het weekmenu',
      body: `${when} worden de boodschappen gedaan. Jij bent aan de beurt: vul de week van ${dayLabel(weekStart)} in en tik op "Week is klaar".`,
      url: '/week',
      weekStart,
    });
  }
  return { reminded };
}

// ---------- The week is ready: tell the shoppers ----------

async function weekReady(env: Env, db: Db, uid: string, weekStart: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'Ongeldige week.' }, 400);

  const me = await db.get(`profiles/${uid}`);
  if (!me?.household_id) return json({ error: 'Geen gezin.' }, 400);
  const h = await db.get(`households/${me.household_id}`);

  await db.merge(`households/${me.household_id}/weekPlans/${weekStart}`, {
    household_id: me.household_id,
    week_start: weekStart,
    ready_at: new Date().toISOString(),
    ready_by: me.id,
  });

  const members = await db.where('profiles', 'household_id', me.household_id);
  const memberIds = new Set(members.map((m) => m.id));
  const shoppers = ((h?.shopper_ids ?? []) as string[]).filter((id) => memberIds.has(id) && id !== me.id);
  const notified = await send(env, db, shoppers, {
    title: 'Het weekmenu is klaar',
    body: `${me.display_name} heeft de week van ${dayLabel(weekStart)} ingevuld. Het boodschappenlijstje staat klaar.`,
    url: '/shopping',
    weekStart,
  });
  return json({ notified, shoppers: shoppers.length });
}

// ---------- Photos ----------

/** Cloudinary's signature: the sorted fields, then the secret, as SHA-1. */
export async function cloudinarySignature(fields: Record<string, string>, secret: string) {
  const line = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${line}${secret}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only into your own family's folder, as with the storage rules before. */
async function photoPermission(env: Env, db: Db, uid: string, householdId: string) {
  const me = await db.get(`profiles/${uid}`);
  if (!me?.household_id || me.household_id !== householdId) return json({ error: 'Niet jouw gezin.' }, 403);
  const fields = { folder: `recipe-images/${householdId}`, timestamp: String(Math.floor(Date.now() / 1000)) };
  return json({
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    fields: {
      ...fields,
      api_key: env.CLOUDINARY_API_KEY,
      signature: await cloudinarySignature(fields, env.CLOUDINARY_API_SECRET!),
    },
  });
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Alleen POST.' }, 405);
    const db = firestore(env);
    try {
      const uid = await verifiedUser(env, request.headers.get('Authorization'));
      if (!uid) return json({ error: 'Niet ingelogd.' }, 401);
      const body = (await request.json().catch(() => ({}))) as { weekStart?: unknown; householdId?: unknown };
      const { pathname } = new URL(request.url);
      if (pathname === '/ready') return await weekReady(env, db, uid, String(body.weekStart ?? ''));
      if (pathname === '/photo') return await photoPermission(env, db, uid, String(body.householdId ?? ''));
      return json({ error: 'Onbekend verzoek.' }, 400);
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  },

  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(sendReminders(env));
  },
};

