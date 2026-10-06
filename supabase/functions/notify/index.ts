// Sends Weekmenu's push notifications.
// - {"type": "reminders"}: called every hour by pg_cron (see supabase/notifications.sql). Reminds
//   whoever chooses the coming week, from the set number of days before the shopping day, every day
//   at the set hour until the week is ready. Each reminder goes out once, so extra calls do no harm.
// - {"type": "ready", "weekStart": "YYYY-MM-DD"}: called by the app (signed in) when the week is
//   ready; marks it ready and tells the shoppers.
// Deploy: npx supabase functions deploy notify --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (web push for the iPhone web app)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const TIME_ZONE = 'Europe/Amsterdam';
const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

type Household = {
  id: string;
  shopping_day: number;
  chooser_rotation: string[];
  rotation_start: string | null;
  remind_days_before: number;
  remind_hour: number;
  shopper_ids: string[];
};
type Message = { title: string; body: string; url: string; weekStart: string };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ---------- Dates (YYYY-MM-DD, Monday = 0) ----------

function amsterdamNow(): { today: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
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

async function choosersOf(db: SupabaseClient, h: Household, weekStart: string, planId: string | null): Promise<string[]> {
  const { data: members } = await db.from('profiles').select('id').eq('household_id', h.id);
  const memberIds = new Set((members ?? []).map((m) => m.id as string));
  const rotation = (h.chooser_rotation ?? []).filter((id) => memberIds.has(id));
  let turn: string | null = null;
  if (rotation.length && h.rotation_start) {
    // The rotation's start week may be from before the shopping day changed: take its middle.
    const start = weekStartOf(addDays(h.rotation_start, 3), h.shopping_day);
    const weeks = Math.round(daysBetween(start, weekStart) / 7);
    turn = rotation[((weeks % rotation.length) + rotation.length) % rotation.length];
  }
  const perDay: (string | null)[] = Array(7).fill(turn);
  if (planId) {
    const { data: overrides } = await db.from('week_plan_choosers').select('day, chooser_id').eq('week_plan_id', planId);
    for (const o of overrides ?? []) perDay[o.day as number] = o.chooser_id as string | null;
  }
  return [...new Set(perDay.filter((id): id is string => !!id && memberIds.has(id)))];
}

// ---------- Sending ----------

async function send(db: SupabaseClient, userIds: string[], message: Message): Promise<number> {
  if (!userIds.length) return 0;
  const { data: tokens } = await db.from('push_tokens').select('token, kind, subscription').in('user_id', userIds);
  let sent = 0;
  const gone: string[] = [];

  const expo = (tokens ?? []).filter((t) => t.kind === 'expo');
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
    const result = await response.json().catch(() => null);
    (result?.data ?? []).forEach((ticket: { status: string; details?: { error?: string } }, i: number) => {
      if (ticket.status === 'ok') sent++;
      else if (ticket.details?.error === 'DeviceNotRegistered') gone.push(expo[i].token);
    });
  }

  const web = (tokens ?? []).filter((t) => t.kind === 'web' && t.subscription);
  if (web.length) {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (publicKey && privateKey) {
      webpush.setVapidDetails('https://weekmenu.expo.app', publicKey, privateKey);
      await Promise.all(
        web.map(async (t) => {
          try {
            await webpush.sendNotification(t.subscription, JSON.stringify(message));
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            // The browser unsubscribed (or the app was removed from the home screen).
            if (status === 404 || status === 410) gone.push(t.token);
          }
        }),
      );
    }
  }

  if (gone.length) await db.from('push_tokens').delete().in('token', gone);
  return sent;
}

// ---------- Reminders for whoever chooses ----------

async function sendReminders(db: SupabaseClient) {
  const { today, hour } = amsterdamNow();
  const { data: households } = await db
    .from('households')
    .select('id, shopping_day, chooser_rotation, rotation_start, remind_days_before, remind_hour, shopper_ids');
  let reminded = 0;
  for (const h of (households ?? []) as Household[]) {
    if (hour !== h.remind_hour) continue;
    // The coming week starts on the next shopping day after today.
    const weekStart = addDays(today, ((h.shopping_day - weekdayOf(today) + 7) % 7) || 7);
    const daysLeft = daysBetween(today, weekStart);
    if (daysLeft > h.remind_days_before) continue;

    const { data: plan } = await db
      .from('week_plans')
      .select('id, ready_at')
      .eq('household_id', h.id)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (plan?.ready_at) continue;
    const choosers = await choosersOf(db, h, weekStart, plan?.id ?? null);
    if (!choosers.length) continue;

    // Once a day per week, also when this runs more than once in the hour.
    const { error } = await db.from('reminders_sent').insert({ household_id: h.id, week_start: weekStart, sent_on: today });
    if (error) continue;

    const when = daysLeft === 0 ? 'Vandaag' : daysLeft === 1 ? 'Morgen' : `Over ${daysLeft} dagen`;
    reminded += await send(db, choosers, {
      title: 'Kies het weekmenu',
      body: `${when} worden de boodschappen gedaan. Jij bent aan de beurt: vul de week van ${dayLabel(weekStart)} in en tik op "Week is klaar".`,
      url: '/week',
      weekStart,
    });
  }
  return json({ reminded });
}

// ---------- The week is ready: tell the shoppers ----------

async function weekReady(db: SupabaseClient, req: Request, weekStart: string) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  if (!auth?.user) return json({ error: 'Niet ingelogd.' }, 401);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'Ongeldige week.' }, 400);

  const { data: me } = await db.from('profiles').select('id, display_name, household_id').eq('id', auth.user.id).single();
  if (!me?.household_id) return json({ error: 'Geen gezin.' }, 400);
  const { data: h } = await db.from('households').select('id, shopper_ids').eq('id', me.household_id).single();

  const { error } = await db
    .from('week_plans')
    .upsert(
      { household_id: me.household_id, week_start: weekStart, ready_at: new Date().toISOString(), ready_by: me.id },
      { onConflict: 'household_id,week_start' },
    );
  if (error) return json({ error: error.message }, 500);

  const { data: members } = await db.from('profiles').select('id').eq('household_id', me.household_id);
  const memberIds = new Set((members ?? []).map((m) => m.id as string));
  const shoppers = ((h?.shopper_ids ?? []) as string[]).filter((id) => memberIds.has(id) && id !== me.id);
  const notified = await send(db, shoppers, {
    title: 'Het weekmenu is klaar',
    body: `${me.display_name} heeft de week van ${dayLabel(weekStart)} ingevuld. Het boodschappenlijstje staat klaar.`,
    url: '/shopping',
    weekStart,
  });
  return json({ notified, shoppers: shoppers.length });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Alleen POST.' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.type === 'reminders') return await sendReminders(db);
    if (body.type === 'ready') return await weekReady(db, req, String(body.weekStart ?? ''));
    return json({ error: 'Onbekend verzoek.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
