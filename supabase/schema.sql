-- Weekmenu database schema
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- ============================================================
-- Tables
-- ============================================================

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
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

-- One plan per household per week (week_start is always a Monday).
create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  unique (household_id, week_start)
);

-- day: 0 = Monday ... 6 = Sunday
create table public.week_plan_meals (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  day int not null check (day between 0 and 6),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  servings int not null check (servings > 0),
  -- Adjustments for this evening only; the recipe itself stays unchanged.
  note text,
  custom_ingredients jsonb, -- [{ name, quantity, unit }], null = use the recipe's ingredients
  unique (week_plan_id, day)
);

-- Who chooses the dish for each day. One person can do the whole week,
-- or the week can be split (e.g. mum chooses 3 evenings, I choose 4).
create table public.week_plan_choosers (
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  day int not null check (day between 0 and 6),
  chooser_id uuid not null references public.profiles (id) on delete cascade,
  primary key (week_plan_id, day)
);

-- Which shopping list items have been ticked off for a week.
create table public.shopping_checks (
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  item_key text not null,
  primary key (week_plan_id, item_key)
);

create index on public.recipes (household_id);
create index on public.recipe_ingredients (recipe_id);
create index on public.week_plan_meals (week_plan_id);

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

-- Move a dish to another day of the same week; swaps if that day already has a dish.
-- Runs with the caller's rights, so row level security still applies.
create or replace function public.move_meal(meal_id uuid, to_day int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  m public.week_plan_meals;
  t public.week_plan_meals;
begin
  select * into m from public.week_plan_meals where id = meal_id;
  if m.id is null then
    raise exception 'Gerecht niet gevonden';
  end if;
  if m.day = to_day then
    return;
  end if;
  select * into t from public.week_plan_meals where week_plan_id = m.week_plan_id and day = to_day;
  if t.id is not null then
    delete from public.week_plan_meals where id = t.id;
  end if;
  update public.week_plan_meals set day = to_day where id = m.id;
  if t.id is not null then
    insert into public.week_plan_meals (id, week_plan_id, day, recipe_id, servings, note, custom_ingredients)
    values (t.id, t.week_plan_id, m.day, t.recipe_id, t.servings, t.note, t.custom_ingredients);
  end if;
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.move_meal(uuid, int) to authenticated;
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
