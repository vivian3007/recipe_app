-- Allows more than one dish per evening, for an existing database.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- (A new database gets this from schema.sql.)

alter table public.week_plan_meals drop constraint week_plan_meals_week_plan_id_day_key;
alter table public.week_plan_meals add column created_at timestamptz not null default now();

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

grant execute on function public.swap_days(uuid, int, int) to authenticated;

-- Older app versions move dishes with move_meal; keep it working until everyone has the update:
-- the whole evening on the target day goes to the dish's old day.
create or replace function public.move_meal(meal_id uuid, to_day int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  m public.week_plan_meals;
begin
  select * into m from public.week_plan_meals where id = meal_id;
  if m.id is null then
    raise exception 'Gerecht niet gevonden';
  end if;
  if m.day = to_day then
    return;
  end if;
  update public.week_plan_meals set day = m.day where week_plan_id = m.week_plan_id and day = to_day;
  update public.week_plan_meals set day = to_day where id = m.id;
end;
$$;
