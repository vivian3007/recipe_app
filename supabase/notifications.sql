-- Push notifications: a reminder for whoever chooses the coming week, and a message for
-- the shoppers when that week is ready. Run this once in the Supabase SQL Editor.

-- Family settings: the first reminder comes this many days before the shopping day, at this
-- hour (Dutch time), and then every day at that hour until the week is ready.
alter table public.households add column if not exists remind_days_before int not null default 2
  check (remind_days_before between 0 and 6);
alter table public.households add column if not exists remind_hour int not null default 9
  check (remind_hour between 0 and 23);
-- Who does the shopping: they hear when the coming week is ready.
alter table public.households add column if not exists shopper_ids uuid[] not null default '{}';

-- When whoever chose marked the week as ready (null = not ready yet).
alter table public.week_plans add column if not exists ready_at timestamptz;
alter table public.week_plans add column if not exists ready_by uuid references public.profiles (id) on delete set null;

-- Where to send someone's notifications: one row per phone or browser.
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('expo', 'web')),
  -- The browser's push subscription (endpoint and keys) for kind 'web'.
  subscription jsonb,
  created_at timestamptz not null default now()
);
create index if not exists push_tokens_user_id on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reminders already sent, so the hourly check sends each one only once.
create table if not exists public.reminders_sent (
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  sent_on date not null,
  primary key (household_id, week_start, sent_on)
);
-- Only the notify function (service role) uses this table.
alter table public.reminders_sent enable row level security;

-- Every hour, the notify function sends the reminders that are due. Calling it more often
-- does no harm: each reminder goes out once.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('weekmenu-reminders') where exists (select 1 from cron.job where jobname = 'weekmenu-reminders');
select cron.schedule(
  'weekmenu-reminders',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://vvypududuebgrdldgqup.supabase.co/functions/v1/notify',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{"type": "reminders"}'::jsonb
     ) $$
);

notify pgrst, 'reload schema';
