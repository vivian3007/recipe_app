-- The shopping list by supermarket aisle: products the family moved to another aisle,
-- { "product name in lower case": "aisle key" }. Run this once for an existing database.
alter table public.households add column if not exists aisle_overrides jsonb not null default '{}';

notify pgrst, 'reload schema';
