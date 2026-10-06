import * as ImagePicker from 'expo-image-picker';

import { base64ToArrayBuffer } from './base64';
import { supabase } from './supabase';
import { replaceTags } from './tags';
import type {
  ChooserOverrides,
  Ingredient,
  NotificationSettings,
  OwnAvgOption,
  Recipe,
  RecipeInput,
  RecipeWithIngredients,
  ShoppingExtra,
  WeekPlan,
  WeekPlanMeal,
} from './types';
import { ownDishRecipe } from './types';

const RECIPE_FIELDS =
  'id, household_id, created_by, title, description, image_url, servings, prep_minutes, instructions, source_url, tags, created_at, author:profiles!recipes_created_by_fkey(display_name)';
const INGREDIENT_FIELDS = 'recipe_ingredients(id, name, quantity, unit, position)';

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function sortIngredients(recipe: RecipeWithIngredients) {
  recipe.recipe_ingredients.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return recipe;
}

// ---------- Profile ----------

export async function updateDisplayName(userId: string, displayName: string) {
  check(await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId));
}

// ---------- Recipes ----------

export async function listRecipes(): Promise<Recipe[]> {
  return check(
    await supabase.from('recipes').select(RECIPE_FIELDS).order('created_at', { ascending: false }),
  ) as unknown as Recipe[];
}

/**
 * Replaces labels in every recipe of the household: merging and renaming (to a label) or
 * removing (to null). Safe to run again if it stops halfway.
 */
export async function replaceTagsEverywhere(from: string[], to: string | null) {
  const recipes = check(await supabase.from('recipes').select('id, tags').overlaps('tags', from)) as {
    id: string;
    tags: string[];
  }[];
  await Promise.all(
    recipes.map(async (r) =>
      check(await supabase.from('recipes').update({ tags: replaceTags(r.tags, from, to) }).eq('id', r.id)),
    ),
  );
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients> {
  const recipe = check(
    await supabase.from('recipes').select(`${RECIPE_FIELDS}, ${INGREDIENT_FIELDS}`).eq('id', id).single(),
  ) as unknown as RecipeWithIngredients;
  return sortIngredients(recipe);
}

export async function saveRecipe(
  input: RecipeInput,
  ctx: { householdId: string; userId: string },
  existingId?: string,
): Promise<string> {
  const { ingredients, ...fields } = input;
  let id = existingId;

  if (id) {
    check(await supabase.from('recipes').update(fields).eq('id', id));
    check(await supabase.from('recipe_ingredients').delete().eq('recipe_id', id));
  } else {
    const row = check(
      await supabase
        .from('recipes')
        .insert({ ...fields, household_id: ctx.householdId, created_by: ctx.userId })
        .select('id')
        .single(),
    );
    id = row!.id as string;
  }

  const rows = ingredients
    .filter((i) => i.name.trim())
    .map((i, position) => ({
      recipe_id: id,
      name: i.name.trim(),
      quantity: i.quantity,
      unit: i.unit?.trim() || null,
      position,
    }));
  if (rows.length) check(await supabase.from('recipe_ingredients').insert(rows));
  return id!;
}

export async function deleteRecipe(id: string) {
  check(await supabase.from('recipes').delete().eq('id', id));
}

/** Lets the user pick a photo and uploads it. Returns the public URL, or null if cancelled. */
export async function pickAndUploadImage(householdId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.6,
    base64: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64) return null;

  const contentType = asset.mimeType ?? 'image/jpeg';
  const ext = contentType.split('/')[1] ?? 'jpg';
  const path = `${householdId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  check(
    await supabase.storage
      .from('recipe-images')
      .upload(path, base64ToArrayBuffer(asset.base64), { contentType }),
  );
  return supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl;
}

// ---------- Favorites ----------

export async function listFavoriteIds(userId: string): Promise<Set<string>> {
  const rows = check(await supabase.from('favorites').select('recipe_id').eq('user_id', userId));
  return new Set((rows ?? []).map((r) => r.recipe_id as string));
}

export async function setFavorite(userId: string, recipeId: string, favorite: boolean) {
  if (favorite) {
    check(await supabase.from('favorites').upsert({ user_id: userId, recipe_id: recipeId }));
  } else {
    check(await supabase.from('favorites').delete().eq('user_id', userId).eq('recipe_id', recipeId));
  }
}

// ---------- Week plans ----------

export async function getWeekPlan(
  weekStart: string,
): Promise<{ plan: WeekPlan | null; meals: WeekPlanMeal[]; chooserOverrides: ChooserOverrides }> {
  const chooserOverrides: ChooserOverrides = Array(7).fill(undefined);
  const plan = check(
    await supabase
      .from('week_plans')
      .select('id, household_id, week_start, ready_at, ready_by')
      .eq('week_start', weekStart)
      .maybeSingle(),
  ) as WeekPlan | null;
  if (!plan) return { plan: null, meals: [], chooserOverrides };

  const [mealsResult, choosersResult] = await Promise.all([
    supabase
      .from('week_plan_meals')
      .select(
        `id, week_plan_id, day, recipe_id, title, servings, note, custom_ingredients, created_at, recipe:recipes(${RECIPE_FIELDS}, ${INGREDIENT_FIELDS})`,
      )
      .eq('week_plan_id', plan.id)
      .order('day')
      .order('created_at'),
    supabase.from('week_plan_choosers').select('day, chooser_id').eq('week_plan_id', plan.id),
  ]);
  const meals = (check(mealsResult) as unknown as WeekPlanMeal[])
    // A dish without a recipe (an AVG) gets a stand-in recipe; a deleted recipe takes its dishes with it.
    .map((m) => (m.recipe_id == null ? { ...m, recipe: ownDishRecipe(m) } : m))
    .filter((m) => m.recipe);
  meals.forEach((m) => sortIngredients(m.recipe));
  for (const row of check(choosersResult) ?? []) chooserOverrides[row.day as number] = row.chooser_id as string | null;
  return { plan, meals, chooserOverrides };
}

async function ensureWeekPlan(householdId: string, weekStart: string): Promise<WeekPlan> {
  return check(
    await supabase
      .from('week_plans')
      .upsert(
        { household_id: householdId, week_start: weekStart },
        { onConflict: 'household_id,week_start', ignoreDuplicates: false },
      )
      .select('id, household_id, week_start')
      .single(),
  ) as WeekPlan;
}

/** Adds a dish to an evening; an evening can have more than one dish. */
export async function addMeal(householdId: string, weekStart: string, day: number, recipeId: string, servings: number) {
  const plan = await ensureWeekPlan(householdId, weekStart);
  check(await supabase.from('week_plan_meals').insert({ week_plan_id: plan.id, day, recipe_id: recipeId, servings }));
}

/** Puts another recipe in place of a planned dish. */
export async function replaceMeal(mealId: string, recipeId: string, servings: number) {
  check(
    await supabase
      .from('week_plan_meals')
      // A new dish starts without the previous dish's adjustments.
      .update({ recipe_id: recipeId, title: null, servings, note: null, custom_ingredients: null })
      .eq('id', mealId),
  );
}

/** Adds a dish without a recipe, such as an AVG; `ingredients` are for one person. */
export async function addOwnDish(
  householdId: string,
  weekStart: string,
  day: number,
  title: string,
  ingredients: Ingredient[],
  servings: number,
) {
  const plan = await ensureWeekPlan(householdId, weekStart);
  check(
    await supabase
      .from('week_plan_meals')
      .insert({ week_plan_id: plan.id, day, recipe_id: null, title, custom_ingredients: ingredients, servings }),
  );
}

/** Changes an AVG, or puts one in place of a planned dish; `ingredients` are for one person. */
export async function updateOwnDish(mealId: string, title: string, ingredients: Ingredient[], servings: number) {
  check(
    await supabase
      .from('week_plan_meals')
      .update({ recipe_id: null, title, custom_ingredients: ingredients, servings, note: null })
      .eq('id', mealId),
  );
}

/** Sets who chooses on the given days of one week; null means nobody, also when it's someone's turn. */
export async function setDayChoosers(householdId: string, weekStart: string, days: number[], chooserId: string | null) {
  const plan = await ensureWeekPlan(householdId, weekStart);
  check(
    await supabase
      .from('week_plan_choosers')
      .upsert(days.map((day) => ({ week_plan_id: plan.id, day, chooser_id: chooserId }))),
  );
}

/** The given days of one week follow the rotation again. */
export async function resetDayChoosers(weekStart: string, days: number[]) {
  const plan = check(
    await supabase.from('week_plans').select('id').eq('week_start', weekStart).maybeSingle(),
  ) as { id: string } | null;
  if (!plan) return;
  check(await supabase.from('week_plan_choosers').delete().eq('week_plan_id', plan.id).in('day', days));
}

/** Who chooses the whole week in turns, starting with whoever chooses the week of `rotationStart`. */
export async function saveChooserRotation(householdId: string, rotation: string[], rotationStart: string) {
  check(
    await supabase
      .from('households')
      .update({ chooser_rotation: rotation, rotation_start: rotationStart })
      .eq('id', householdId),
  );
}

/** The ingredients of every AVG the family planned, to put the most used choices first. */
export async function listAvgDishes(): Promise<Ingredient[][]> {
  const rows = check(await supabase.from('week_plan_meals').select('custom_ingredients').is('recipe_id', null));
  return (rows ?? []).map((r) => (r.custom_ingredients as Ingredient[] | null) ?? []);
}

/** When reminders go out, and who does the shopping. */
export async function saveNotificationSettings(householdId: string, settings: Partial<NotificationSettings>) {
  check(await supabase.from('households').update(settings).eq('id', householdId));
}

/** Marks the week as ready and tells the shoppers (the notify function). */
export async function markWeekReady(_householdId: string, weekStart: string): Promise<{ notified: number; shoppers: number }> {
  const { data, error } = await supabase.functions.invoke('notify', { body: { type: 'ready', weekStart } });
  if (error) {
    const message = await (error as { context?: Response }).context
      ?.json()
      .then((b: { error?: string }) => b.error)
      .catch(() => null);
    throw new Error(message ?? error.message);
  }
  return data as { notified: number; shoppers: number };
}

/** The week isn't ready after all: whoever chooses gets reminders again. */
export async function unmarkWeekReady(householdId: string, weekStart: string) {
  check(
    await supabase
      .from('week_plans')
      .update({ ready_at: null, ready_by: null })
      .eq('household_id', householdId)
      .eq('week_start', weekStart),
  );
}

/** The family's own AVG choices, next to the standard ones. */
export async function saveAvgOptions(householdId: string, options: OwnAvgOption[]) {
  check(await supabase.from('households').update({ avg_options: options }).eq('id', householdId));
}

/** Weeks start on the shopping day; everything planned moves along and keeps its date. */
export async function setShoppingDay(_householdId: string, day: number) {
  check(await supabase.rpc('set_shopping_day', { new_day: day }));
}

/** Swaps all dishes of two evenings of the same week. */
export async function swapDays(weekPlanId: string, dayA: number, dayB: number) {
  check(await supabase.rpc('swap_days', { plan_id: weekPlanId, day_a: dayA, day_b: dayB }));
}

/** Note and adjusted ingredients for one evening; pass null ingredients to go back to the recipe. */
export async function updateMealAdjustments(
  mealId: string,
  adjustments: { note: string | null; custom_ingredients: Ingredient[] | null },
) {
  check(await supabase.from('week_plan_meals').update(adjustments).eq('id', mealId));
}

export async function updateMealServings(mealId: string, servings: number) {
  check(await supabase.from('week_plan_meals').update({ servings }).eq('id', mealId));
}

export async function removeMeal(mealId: string) {
  check(await supabase.from('week_plan_meals').delete().eq('id', mealId));
}

// ---------- Shopping list ----------

export async function listShoppingChecks(weekPlanId: string): Promise<Set<string>> {
  const rows = check(await supabase.from('shopping_checks').select('item_key').eq('week_plan_id', weekPlanId));
  return new Set((rows ?? []).map((r) => r.item_key as string));
}

export async function setShoppingCheck(weekPlanId: string, itemKey: string, checked: boolean) {
  if (checked) {
    check(await supabase.from('shopping_checks').upsert({ week_plan_id: weekPlanId, item_key: itemKey }));
  } else {
    check(
      await supabase.from('shopping_checks').delete().eq('week_plan_id', weekPlanId).eq('item_key', itemKey),
    );
  }
}

export async function listShoppingExtras(weekPlanId: string): Promise<ShoppingExtra[]> {
  return check(
    await supabase
      .from('shopping_extras')
      .select('id, week_plan_id, name')
      .eq('week_plan_id', weekPlanId)
      .order('created_at'),
  ) as ShoppingExtra[];
}

export async function addShoppingExtra(householdId: string, weekStart: string, userId: string, name: string) {
  const plan = await ensureWeekPlan(householdId, weekStart);
  check(await supabase.from('shopping_extras').insert({ week_plan_id: plan.id, name, created_by: userId }));
}

export async function removeShoppingExtra(extra: ShoppingExtra) {
  check(await supabase.from('shopping_extras').delete().eq('id', extra.id));
  await setShoppingCheck(extra.week_plan_id, `extra:${extra.id}`, false);
}
