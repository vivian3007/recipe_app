import * as ImagePicker from 'expo-image-picker';

import { base64ToArrayBuffer } from './base64';
import { supabase } from './supabase';
import type { DayChoosers, Ingredient, Recipe, RecipeInput, RecipeWithIngredients, WeekPlan, WeekPlanMeal } from './types';

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
): Promise<{ plan: WeekPlan | null; meals: WeekPlanMeal[]; choosers: DayChoosers }> {
  const choosers: DayChoosers = Array(7).fill(null);
  const plan = check(
    await supabase
      .from('week_plans')
      .select('id, household_id, week_start')
      .eq('week_start', weekStart)
      .maybeSingle(),
  ) as WeekPlan | null;
  if (!plan) return { plan: null, meals: [], choosers };

  const [mealsResult, choosersResult] = await Promise.all([
    supabase
      .from('week_plan_meals')
      .select(`id, week_plan_id, day, recipe_id, servings, note, custom_ingredients, recipe:recipes(${RECIPE_FIELDS}, ${INGREDIENT_FIELDS})`)
      .eq('week_plan_id', plan.id)
      .order('day'),
    supabase.from('week_plan_choosers').select('day, chooser_id').eq('week_plan_id', plan.id),
  ]);
  const meals = (check(mealsResult) as unknown as WeekPlanMeal[]).filter((m) => m.recipe);
  meals.forEach((m) => sortIngredients(m.recipe));
  for (const row of check(choosersResult) ?? []) choosers[row.day as number] = row.chooser_id as string;
  return { plan, meals, choosers };
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

export async function setMeal(
  householdId: string,
  weekStart: string,
  day: number,
  recipeId: string,
  servings: number,
) {
  const plan = await ensureWeekPlan(householdId, weekStart);
  check(
    await supabase
      .from('week_plan_meals')
      // A new dish starts without the previous dish's adjustments.
      .upsert(
        { week_plan_id: plan.id, day, recipe_id: recipeId, servings, note: null, custom_ingredients: null },
        { onConflict: 'week_plan_id,day' },
      ),
  );
}

/** Sets who chooses on the given days; null clears them. */
export async function setDayChoosers(householdId: string, weekStart: string, days: number[], chooserId: string | null) {
  const plan = await ensureWeekPlan(householdId, weekStart);
  if (chooserId) {
    check(
      await supabase
        .from('week_plan_choosers')
        .upsert(days.map((day) => ({ week_plan_id: plan.id, day, chooser_id: chooserId }))),
    );
  } else {
    check(await supabase.from('week_plan_choosers').delete().eq('week_plan_id', plan.id).in('day', days));
  }
}

/** Moves a dish to another day of its week; swaps when that day already has a dish. */
export async function moveMeal(mealId: string, toDay: number) {
  check(await supabase.rpc('move_meal', { meal_id: mealId, to_day: toDay }));
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
