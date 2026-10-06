-- Weekmenu database schema
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- ============================================================
-- Tables
-- ============================================================

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  -- Weekday the weeks start on (Monday = 0 ... Sunday = 6).
  shopping_day int not null default 0 check (shopping_day between 0 and 6),
  -- Who chooses the whole week, in turns; rotation_start is a week in which the first one chooses.
  chooser_rotation uuid[] not null default '{}',
  rotation_start date,
  -- The family's own AVG choices: [{ group, label, name, quantity, unit }], amounts for one person.
  avg_options jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  household_id uuid references public.households (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null,
  description text,
  image_url text,
  servings int not null default 4 check (servings > 0),
  prep_minutes int check (prep_minutes >= 0),
  instructions text,
  source_url text, -- link to the original recipe on a website
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  position int not null default 0
);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- One plan per household per week (week_start is always the household's shopping day).
create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  unique (household_id, week_start)
);

-- day: 0 = the first day of the week (week_start) ... 6. An evening can have more than one dish.
create table public.week_plan_meals (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  day int not null check (day between 0 and 6),
  -- null for a dish without a recipe, such as an AVG (aardappels, groente, vlees).
  recipe_id uuid references public.recipes (id) on delete cascade,
  -- Name of a dish without a recipe.
  title text,
  servings int not null check (servings > 0),
  -- Adjustments for this evening only; the recipe itself stays unchanged.
  note text,
  -- [{ name, quantity, unit }], null = use the recipe's ingredients.
  -- For a dish without a recipe: its ingredients for one person.
  custom_ingredients jsonb,
  created_at timestamptz not null default now(),
  constraint week_plan_meals_recipe_or_own
    check (recipe_id is not null or (title is not null and custom_ingredients is not null))
);

-- Who chooses the dish on a day of one week, when that differs from the rotation
-- (e.g. mum chooses 3 evenings, I choose 4). chooser_id null means nobody that day.
create table public.week_plan_choosers (
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  day int not null check (day between 0 and 6),
  chooser_id uuid references public.profiles (id) on delete cascade,
  primary key (week_plan_id, day)
);

-- Which shopping list items have been ticked off for a week.
create table public.shopping_checks (
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  item_key text not null,
  primary key (week_plan_id, item_key)
);

-- Things added to the shopping list by hand (not from a recipe), e.g. "melk".
create table public.shopping_extras (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.recipes (household_id);
create index on public.recipe_ingredients (recipe_id);
create index on public.week_plan_meals (week_plan_id);
create index on public.shopping_extras (week_plan_id);

-- ============================================================
-- Helpers
-- ============================================================

create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_household(household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;
  insert into public.households (name) values (household_name) returning * into h;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end;
$$;

create or replace function public.join_household(code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;
  select * into h from public.households where invite_code = upper(trim(code));
  if h.id is null then
    raise exception 'Onbekende gezinscode';
  end if;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end;
$$;

-- Swap all dishes of two evenings of the same week (an evening can have more than one dish).
-- Runs with the caller's rights, so row level security still applies.
create or replace function public.swap_days(plan_id uuid, day_a int, day_b int)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.week_plan_meals
  set day = case when day = day_a then day_b else day_a end
  where week_plan_id = plan_id and day in (day_a, day_b);
$$;

-- First day of the week containing d, when weeks start on weekday start_day (Monday = 0).
create or replace function public.shopping_week_start(d date, start_day int)
returns date
language sql
immutable
as $$
  select d - ((extract(isodow from d)::int - 1 - start_day + 7) % 7);
$$;

-- Changes the shopping day and moves everything that was planned into the new weeks:
-- every dish stays on its own date. Runs with the caller's rights, so row level security applies.
create or replace function public.set_shopping_day(new_day int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  hh uuid := public.my_household_id();
begin
  if hh is null then
    raise exception 'Geen gezin';
  end if;
  if new_day is null or new_day not between 0 and 6 then
    raise exception 'Ongeldige dag';
  end if;

  update households set shopping_day = new_day where id = hh;

  -- The new weeks: for every day with a dish or its own chooser, and for the middle of each old
  -- week (the shopping list's own items and ticks go to the new week that holds most of it).
  insert into week_plans (household_id, week_start)
  select distinct hh, shopping_week_start(p.week_start + x.day, new_day)
  from week_plans p
  join (
    select week_plan_id, day from week_plan_meals
    union select week_plan_id, day from week_plan_choosers
    union select id, 3 from week_plans
  ) x on x.week_plan_id = p.id
  where p.household_id = hh and p.week_start <> shopping_week_start(p.week_start, new_day)
  on conflict (household_id, week_start) do nothing;

  update week_plan_meals m
  set week_plan_id = np.id, day = (p.week_start + m.day) - np.week_start
  from week_plans p, week_plans np
  where m.week_plan_id = p.id
    and p.household_id = hh and p.week_start <> shopping_week_start(p.week_start, new_day)
    and np.household_id = hh and np.week_start = shopping_week_start(p.week_start + m.day, new_day);

  insert into week_plan_choosers (week_plan_id, day, chooser_id)
  select np.id, (p.week_start + c.day) - np.week_start, c.chooser_id
  from week_plan_choosers c
  join week_plans p on p.id = c.week_plan_id
  join week_plans np on np.household_id = hh and np.week_start = shopping_week_start(p.week_start + c.day, new_day)
  where p.household_id = hh and p.week_start <> shopping_week_start(p.week_start, new_day)
  on conflict (week_plan_id, day) do nothing;

  update shopping_extras e
  set week_plan_id = np.id
  from week_plans p, week_plans np
  where e.week_plan_id = p.id
    and p.household_id = hh and p.week_start <> shopping_week_start(p.week_start, new_day)
    and np.household_id = hh and np.week_start = shopping_week_start(p.week_start + 3, new_day);

  insert into shopping_checks (week_plan_id, item_key)
  select np.id, c.item_key
  from shopping_checks c
  join week_plans p on p.id = c.week_plan_id
  join week_plans np on np.household_id = hh and np.week_start = shopping_week_start(p.week_start + 3, new_day)
  where p.household_id = hh and p.week_start <> shopping_week_start(p.week_start, new_day)
  on conflict (week_plan_id, item_key) do nothing;

  -- The old weeks are empty now (what's left was copied above).
  delete from week_plans where household_id = hh and week_start <> shopping_week_start(week_start, new_day);
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.set_shopping_day(int) to authenticated;
grant execute on function public.swap_days(uuid, int, int) to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- ============================================================
-- Row level security: everyone only sees data of their own household
-- ============================================================

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.favorites enable row level security;
alter table public.week_plans enable row level security;
alter table public.week_plan_meals enable row level security;
alter table public.week_plan_choosers enable row level security;
alter table public.shopping_checks enable row level security;
alter table public.shopping_extras enable row level security;

create policy "own household" on public.households
  for select using (id = public.my_household_id());
create policy "rename own household" on public.households
  for update using (id = public.my_household_id());

create policy "see household members" on public.profiles
  for select using (id = auth.uid() or household_id = public.my_household_id());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "read household recipes" on public.recipes
  for select using (household_id = public.my_household_id());
create policy "add household recipes" on public.recipes
  for insert with check (household_id = public.my_household_id() and created_by = auth.uid());
create policy "edit household recipes" on public.recipes
  for update using (household_id = public.my_household_id());
create policy "delete own recipes" on public.recipes
  for delete using (household_id = public.my_household_id() and created_by = auth.uid());

create policy "ingredients of household recipes" on public.recipe_ingredients
  for all using (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.my_household_id())
  ) with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.my_household_id())
  );

create policy "own favorites" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "household week plans" on public.week_plans
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

create policy "household week meals" on public.week_plan_meals
  for all using (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  ) with check (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  );

create policy "household week choosers" on public.week_plan_choosers
  for all using (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  ) with check (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  );

create policy "household shopping checks" on public.shopping_checks
  for all using (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  ) with check (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  );

create policy "household shopping extras" on public.shopping_extras
  for all using (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  ) with check (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  );

-- ============================================================
-- Storage for recipe photos (public read, upload into own household folder)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

create policy "upload household recipe images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = public.my_household_id()::text
  );

create policy "delete household recipe images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = public.my_household_id()::text
  );

-- ---------- Push notifications ----------
-- The hourly job that sends the reminders is set up in notifications.sql (it needs the project URL).

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
