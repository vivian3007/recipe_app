-- The family's own aisles on the shopping list: their order, own names for the standard aisles
-- and aisles they added: { order: [aisle key], names: { key: name }, extra: [{ key, label }] }.
-- Run this once for an existing database.
alter table public.households add column if not exists aisle_setup jsonb not null default '{}';

notify pgrst, 'reload schema';
