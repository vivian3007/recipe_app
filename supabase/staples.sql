-- Vaste boodschappen: products the family buys often and goes through every week.
-- Run this once for an existing database.

-- The list itself: [{ id, name }].
alter table public.households add column if not exists staples jsonb not null default '[]';
-- Which staple an extra on the shopping list came from (to see what's already on the list).
alter table public.shopping_extras add column if not exists staple_id text;
-- Staples marked "niet nodig" for that week.
alter table public.week_plans add column if not exists staples_skipped text[] not null default '{}';

notify pgrst, 'reload schema';
