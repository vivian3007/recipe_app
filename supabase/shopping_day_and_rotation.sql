-- Adds the shopping day (weeks start on it) and the fixed order of who chooses, for an existing database.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- (A new database gets this from schema.sql.)

-- Briefly existed in a test version; the fixed order is now a rotation per week.
drop table if exists public.household_default_choosers;

-- Weekday the weeks start on (Monday = 0 ... Sunday = 6), and who chooses the whole week in turns.
alter table public.households add column if not exists shopping_day int not null default 0
  check (shopping_day between 0 and 6);
alter table public.households add column if not exists chooser_rotation uuid[] not null default '{}';
alter table public.households add column if not exists rotation_start date;

-- A week's own choice of who chooses on a day; null means nobody, also when it's someone's turn.
alter table public.week_plan_choosers alter column chooser_id drop not null;

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

grant execute on function public.set_shopping_day(int) to authenticated;

notify pgrst, 'reload schema';
