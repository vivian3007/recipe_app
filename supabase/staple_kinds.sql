-- Vaste boodschappen with an amount ("2 ham"). The kinds themselves live in households.staples.
-- Run this once for an existing database.

alter table public.shopping_extras add column if not exists quantity numeric;

notify pgrst, 'reload schema';
