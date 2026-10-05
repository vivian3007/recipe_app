-- AVG (aardappels, groente, vlees) without a recipe: a dish in the week plan with its own
-- name and ingredients. Run this once in the Supabase SQL Editor for an existing database.

alter table public.week_plan_meals alter column recipe_id drop not null;
alter table public.week_plan_meals add column if not exists title text;

-- A dish is either a recipe, or has its own name and ingredients (per person).
alter table public.week_plan_meals drop constraint if exists week_plan_meals_recipe_or_own;
alter table public.week_plan_meals add constraint week_plan_meals_recipe_or_own
  check (recipe_id is not null or (title is not null and custom_ingredients is not null));

-- The family's own AVG choices, next to the standard ones:
-- [{ group: 'a' | 'g' | 'v' | 'x', label, name, quantity, unit }], amounts for one person.
alter table public.households add column if not exists avg_options jsonb not null default '[]';

notify pgrst, 'reload schema';
