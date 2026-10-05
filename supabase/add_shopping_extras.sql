-- Adds "zelf toevoegen" to the shopping list for an existing database.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- (A new database gets this from schema.sql.)

-- Things added to the shopping list by hand (not from a recipe), e.g. "melk".
create table public.shopping_extras (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.week_plans (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.shopping_extras (week_plan_id);

alter table public.shopping_extras enable row level security;

create policy "household shopping extras" on public.shopping_extras
  for all using (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  ) with check (
    exists (select 1 from public.week_plans p where p.id = week_plan_id and p.household_id = public.my_household_id())
  );
