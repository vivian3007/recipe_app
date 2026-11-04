import * as ImagePicker from 'expo-image-picker';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  orderBy,
  query,
  where,
  type DocumentData,
  type Transaction,
} from 'firebase/firestore';

import type { AisleSetup } from './aisles';
import { OfflineError } from './backend';
import { dateOfDay, fromISODate, toISODate, weekdayOf } from './dates';
import { membersOf } from './family';
import { auth, currentHousehold, db, offlineAware, readDoc, readDocs, write } from './firebase';
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
  Staple,
  WeekPlan,
  WeekPlanMeal,
} from './types';
import { ownDishRecipe } from './types';

const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL;

function householdId() {
  const id = currentHousehold();
  if (!id) throw new Error('Geen gezin');
  return id;
}

const newId = () => doc(collection(db, 'ids')).id;
const now = () => new Date().toISOString();

const householdRef = (id = householdId()) => doc(db, 'households', id);
const recipesOf = () => collection(householdRef(), 'recipes');
const plansOf = () => collection(householdRef(), 'weekPlans');
const mealsOf = () => collection(householdRef(), 'meals');
const choosersOf = () => collection(householdRef(), 'choosers');
const extrasOf = () => collection(householdRef(), 'shoppingExtras');
const favoritesOf = () => collection(householdRef(), 'favorites');
const profileRef = (id: string) => doc(db, 'profiles', id);

const withId = <T>(snapshot: { id: string; data: () => DocumentData | undefined }) =>
  ({ ...snapshot.data(), id: snapshot.id }) as T;

function sortIngredients(recipe: RecipeWithIngredients) {
  recipe.recipe_ingredients = [...(recipe.recipe_ingredients ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return recipe;
}

// ---------- Profile ----------

export async function updateDisplayName(userId: string, displayName: string) {
  await write(async (tx) => {
    tx.update(profileRef(userId), { display_name: displayName });
  });
}

// ---------- Recipes ----------

/** Who added a recipe is shown with it; the family's names come along once per request. */
async function authorNames() {
  const members = await membersOf(householdId());
  return new Map(members.map((m) => [m.id, m.display_name]));
}

function asRecipe(snapshot: { id: string; data: () => DocumentData | undefined }, names: Map<string, string>) {
  const recipe = withId<RecipeWithIngredients>(snapshot);
  const name = recipe.created_by ? names.get(recipe.created_by) : undefined;
  return sortIngredients({ ...recipe, household_id: householdId(), author: name ? { display_name: name } : null });
}

export async function listRecipes(): Promise<Recipe[]> {
  const [snapshot, names] = await Promise.all([readDocs(query(recipesOf(), orderBy('created_at', 'desc'))), authorNames()]);
  return snapshot.docs.map((d) => asRecipe(d, names));
}

/**
 * Replaces labels in every recipe of the household: merging and renaming (to a label) or
 * removing (to null). Safe to run again if it stops halfway.
 */
export async function replaceTagsEverywhere(from: string[], to: string | null) {
  const snapshot = await readDocs(recipesOf());
  const recipes = snapshot.docs.filter((d) => ((d.data().tags ?? []) as string[]).some((t) => from.includes(t)));
  await Promise.all(
    recipes.map((d) =>
      write(async (tx) => {
        tx.update(d.ref, { tags: replaceTags(d.data().tags as string[], from, to) });
      }),
    ),
  );
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients> {
  const [snapshot, names] = await Promise.all([readDoc(doc(recipesOf(), id)), authorNames()]);
  if (!snapshot.exists()) throw new Error('Dit recept bestaat niet meer.');
  return asRecipe(snapshot, names);
}

export async function saveRecipe(
  input: RecipeInput,
  ctx: { householdId: string; userId: string },
  existingId?: string,
): Promise<string> {
  const { ingredients, ...fields } = input;
  const id = existingId ?? newId();
  const recipe_ingredients = ingredients
    .filter((i) => i.name.trim())
    .map((i, position) => ({
      id: newId(),
      name: i.name.trim(),
      quantity: i.quantity,
      unit: i.unit?.trim() || null,
      position,
    }));
  await write(async (tx) => {
    const ref = doc(recipesOf(), id);
    if (existingId) tx.update(ref, { ...fields, recipe_ingredients });
    else tx.set(ref, { ...fields, recipe_ingredients, created_by: ctx.userId, created_at: now() });
  });
  return id;
}

export async function deleteRecipe(id: string) {
  const [meals, members] = await Promise.all([
    readDocs(query(mealsOf(), where('recipe_id', '==', id))),
    membersOf(householdId()),
  ]);
  // A deleted recipe takes its dishes and everyone's favorite with it.
  await write(async (tx) => {
    tx.delete(doc(recipesOf(), id));
    for (const meal of meals.docs) tx.delete(meal.ref);
    for (const member of members) tx.delete(doc(favoritesOf(), `${member.id}_${id}`));
  });
}

/** Asks the server for permission to store a photo, because the key for that stays there. */
async function callWorker<T>(path: string, body: unknown): Promise<T> {
  const token = await offlineAware(() => auth.currentUser!.getIdToken());
  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? 'Dat lukte niet. Probeer het nog eens.');
  return result as T;
}

/** Lets the user pick a photo and uploads it. Returns the public URL, or null if cancelled. */
export async function pickAndUploadImage(forHousehold: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.6,
    base64: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64) return null;

  const { uploadUrl, fields } = await callWorker<{ uploadUrl: string; fields: Record<string, string> }>('/photo', {
    householdId: forHousehold,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: 'POST', body: form });
  } catch {
    throw new OfflineError();
  }
  const uploaded = await response.json().catch(() => null);
  if (!response.ok || !uploaded?.secure_url) throw new Error('De foto opslaan lukte niet. Probeer het nog eens.');
  return uploaded.secure_url as string;
}

// ---------- Favorites ----------

export async function listFavoriteIds(userId: string): Promise<Set<string>> {
  const snapshot = await readDocs(query(favoritesOf(), where('user_id', '==', userId)));
  return new Set(snapshot.docs.map((d) => d.data().recipe_id as string));
}

export async function setFavorite(userId: string, recipeId: string, favorite: boolean) {
  await write(async (tx) => {
    const ref = doc(favoritesOf(), `${userId}_${recipeId}`);
    if (favorite) tx.set(ref, { user_id: userId, recipe_id: recipeId, created_at: now() });
    else tx.delete(ref);
  });
}

// ---------- Week plans ----------

/** A plan's id is the week it's for, which also makes sure a week has only one plan. */
const planRef = (weekStart: string) => doc(plansOf(), weekStart);

function asPlan(snapshot: { id: string; data: () => DocumentData | undefined }): WeekPlan {
  const { checks: _checks, legacy_id: _legacy, ...plan } = snapshot.data() as DocumentData;
  return { ...plan, id: snapshot.id } as WeekPlan;
}

function ensurePlan(tx: Transaction, weekStart: string) {
  tx.set(planRef(weekStart), { household_id: householdId(), week_start: weekStart }, { merge: true });
  return weekStart;
}

/** Changes that were waiting on a phone during the move from Supabase still use the old plan ids. */
async function planIdOf(weekPlanId: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(weekPlanId)) return weekPlanId;
  const snapshot = await readDocs(query(plansOf(), where('legacy_id', '==', weekPlanId)));
  if (snapshot.empty) throw new Error('Deze week bestaat niet meer.');
  return snapshot.docs[0].id;
}

export async function getWeekPlan(
  weekStart: string,
): Promise<{ plan: WeekPlan | null; meals: WeekPlanMeal[]; chooserOverrides: ChooserOverrides }> {
  const chooserOverrides: ChooserOverrides = Array(7).fill(undefined);
  const planSnapshot = await readDoc(planRef(weekStart));
  if (!planSnapshot.exists()) return { plan: null, meals: [], chooserOverrides };

  const [mealsSnapshot, choosersSnapshot, names] = await Promise.all([
    readDocs(query(mealsOf(), where('week_plan_id', '==', weekStart))),
    readDocs(query(choosersOf(), where('week_plan_id', '==', weekStart))),
    authorNames(),
  ]);
  const raw = mealsSnapshot.docs
    .map((d) => withId<Omit<WeekPlanMeal, 'recipe'>>(d))
    .sort((a, b) => a.day - b.day || a.created_at.localeCompare(b.created_at));
  const recipeIds = [...new Set(raw.flatMap((m) => (m.recipe_id ? [m.recipe_id] : [])))];
  const recipes = new Map(
    (await Promise.all(recipeIds.map((id) => readDoc(doc(recipesOf(), id)))))
      .filter((r) => r.exists())
      .map((r) => [r.id, asRecipe(r, names)]),
  );
  const meals = raw.flatMap((m): WeekPlanMeal[] => {
    if (m.recipe_id == null) return [{ ...m, recipe: ownDishRecipe(m) }];
    const recipe = recipes.get(m.recipe_id);
    return recipe ? [{ ...m, recipe }] : [];
  });
  for (const c of choosersSnapshot.docs) chooserOverrides[c.data().day as number] = c.data().chooser_id as string | null;
  return { plan: asPlan(planSnapshot), meals, chooserOverrides };
}

const newMeal = (weekPlanId: string, fields: DocumentData) => ({
  week_plan_id: weekPlanId,
  title: null,
  note: null,
  custom_ingredients: null,
  created_at: now(),
  ...fields,
});

/** Adds a dish to an evening; an evening can have more than one dish. */
export async function addMeal(forHousehold: string, weekStart: string, day: number, recipeId: string, servings: number) {
  await write(async (tx) => {
    const planId = ensurePlan(tx, weekStart);
    tx.set(doc(mealsOf(), newId()), newMeal(planId, { day, recipe_id: recipeId, servings }));
  });
}

/** Puts another recipe in place of a planned dish. */
export async function replaceMeal(mealId: string, recipeId: string, servings: number) {
  await write(async (tx) => {
    // A new dish starts without the previous dish's adjustments.
    tx.update(doc(mealsOf(), mealId), { recipe_id: recipeId, title: null, servings, note: null, custom_ingredients: null });
  });
}

/** Adds a dish without a recipe, such as an AVG; `ingredients` are for one person. */
export async function addOwnDish(
  forHousehold: string,
  weekStart: string,
  day: number,
  title: string,
  ingredients: Ingredient[],
  servings: number,
) {
  await write(async (tx) => {
    const planId = ensurePlan(tx, weekStart);
    tx.set(
      doc(mealsOf(), newId()),
      newMeal(planId, { day, recipe_id: null, title, custom_ingredients: ingredients, servings }),
    );
  });
}

/** Changes an AVG, or puts one in place of a planned dish; `ingredients` are for one person. */
export async function updateOwnDish(mealId: string, title: string, ingredients: Ingredient[], servings: number) {
  await write(async (tx) => {
    tx.update(doc(mealsOf(), mealId), { recipe_id: null, title, custom_ingredients: ingredients, servings, note: null });
  });
}

const chooserRef = (weekPlanId: string, day: number) => doc(choosersOf(), `${weekPlanId}_${day}`);

/** Sets who chooses on the given days of one week; null means nobody, also when it's someone's turn. */
export async function setDayChoosers(forHousehold: string, weekStart: string, days: number[], chooserId: string | null) {
  await write(async (tx) => {
    const planId = ensurePlan(tx, weekStart);
    for (const day of days) tx.set(chooserRef(planId, day), { week_plan_id: planId, day, chooser_id: chooserId });
  });
}

/** The given days of one week follow the rotation again. */
export async function resetDayChoosers(weekStart: string, days: number[]) {
  await write(async (tx) => {
    for (const day of days) tx.delete(chooserRef(weekStart, day));
  });
}

const updateHousehold = (id: string, fields: DocumentData) =>
  write(async (tx) => {
    tx.update(householdRef(id), fields);
  });

/** Who chooses the whole week in turns, starting with whoever chooses the week of `rotationStart`. */
export async function saveChooserRotation(forHousehold: string, rotation: string[], rotationStart: string) {
  await updateHousehold(forHousehold, { chooser_rotation: rotation, rotation_start: rotationStart });
}

/** The ingredients of every AVG the family planned, to put the most used choices first. */
export async function listAvgDishes(): Promise<Ingredient[][]> {
  const snapshot = await readDocs(query(mealsOf(), where('recipe_id', '==', null)));
  return snapshot.docs.map((d) => (d.data().custom_ingredients as Ingredient[] | null) ?? []);
}

/** Products the family moved to another supermarket aisle. */
export async function saveAisleOverrides(forHousehold: string, overrides: Record<string, string>) {
  await updateHousehold(forHousehold, { aisle_overrides: overrides });
}

/** Vaste boodschappen: the products the family goes through every week. */
export async function saveStaples(forHousehold: string, staples: Staple[]) {
  await updateHousehold(forHousehold, { staples });
}

/** Marks a staple as not needed this week, or takes that back. */
export async function setStapleSkipped(forHousehold: string, weekStart: string, stapleId: string, skipped: boolean) {
  await write(async (tx) => {
    ensurePlan(tx, weekStart);
    tx.set(planRef(weekStart), { staples_skipped: skipped ? arrayUnion(stapleId) : arrayRemove(stapleId) }, { merge: true });
  });
}

/** The family's own aisles: their order, names and aisles they added. */
export async function saveAisleSetup(forHousehold: string, setup: AisleSetup) {
  await updateHousehold(forHousehold, { aisle_setup: setup });
}

/** When reminders go out, and who does the shopping. */
export async function saveNotificationSettings(forHousehold: string, settings: Partial<NotificationSettings>) {
  await updateHousehold(forHousehold, settings);
}

/** Marks the week as ready and tells the shoppers (the notify worker). */
export async function markWeekReady(_householdId: string, weekStart: string): Promise<{ notified: number; shoppers: number }> {
  return callWorker('/ready', { weekStart });
}

/** The week isn't ready after all: whoever chooses gets reminders again. */
export async function unmarkWeekReady(forHousehold: string, weekStart: string) {
  await write(async (tx) => {
    tx.update(planRef(weekStart), { ready_at: null, ready_by: null });
  });
}

/** The family's own AVG choices, next to the standard ones. */
export async function saveAvgOptions(forHousehold: string, options: OwnAvgOption[]) {
  await updateHousehold(forHousehold, { avg_options: options });
}

/**
 * Weeks start on the shopping day; everything planned moves along and keeps its date. One old week
 * at a time, so a family's whole history always fits: if this stops halfway, doing it again
 * finishes the rest, because what has moved already isn't in an old week any more.
 */
export async function setShoppingDay(forHousehold: string, day: number) {
  if (day == null || day < 0 || day > 6) throw new Error('Ongeldige dag');
  const startOf = (date: Date) => {
    const copy = new Date(date);
    copy.setDate(copy.getDate() - ((weekdayOf(copy) - day + 7) % 7));
    return toISODate(copy);
  };
  /** The new week holding `date`, and the date's day in it. */
  const place = (date: Date) => {
    const week = startOf(date);
    return { week, day: Math.round((date.getTime() - fromISODate(week).getTime()) / 86_400_000) };
  };

  const plans = await readDocs(plansOf());
  for (const old of plans.docs.filter((p) => p.id !== startOf(fromISODate(p.id)))) {
    const [meals, choosers, extras] = await Promise.all([
      readDocs(query(mealsOf(), where('week_plan_id', '==', old.id))),
      readDocs(query(choosersOf(), where('week_plan_id', '==', old.id))),
      readDocs(query(extrasOf(), where('week_plan_id', '==', old.id))),
    ]);
    await write(async (tx) => {
      const current = await tx.get(old.ref);
      if (!current.exists()) return;
      // The middle of the old week also gets a plan, for the list's own items and ticks.
      const middle = place(dateOfDay(old.id, 3)).week;
      const targets = new Set([middle]);
      for (const m of meals.docs) targets.add(place(dateOfDay(old.id, m.data().day as number)).week);
      for (const c of choosers.docs) targets.add(place(dateOfDay(old.id, c.data().day as number)).week);
      const taken = new Map<string, boolean>();
      for (const c of choosers.docs) {
        const to = place(dateOfDay(old.id, c.data().day as number));
        const ref = chooserRef(to.week, to.day);
        taken.set(ref.id, (await tx.get(ref)).exists());
      }

      for (const week of targets) ensurePlan(tx, week);
      for (const m of meals.docs) {
        const to = place(dateOfDay(old.id, m.data().day as number));
        tx.update(m.ref, { week_plan_id: to.week, day: to.day });
      }
      for (const c of choosers.docs) {
        const to = place(dateOfDay(old.id, c.data().day as number));
        const ref = chooserRef(to.week, to.day);
        // What the new week already has for that day stays.
        if (!taken.get(ref.id)) tx.set(ref, { week_plan_id: to.week, day: to.day, chooser_id: c.data().chooser_id });
        tx.delete(c.ref);
      }
      for (const e of extras.docs) tx.update(e.ref, { week_plan_id: middle });
      const checks = (current.data().checks ?? []) as string[];
      if (checks.length) tx.set(planRef(middle), { checks: arrayUnion(...checks) }, { merge: true });
      // The old week is empty now.
      tx.delete(old.ref);
    });
  }
  await updateHousehold(forHousehold, { shopping_day: day });
}

/** Swaps all dishes of two evenings of the same week. */
export async function swapDays(weekPlanId: string, dayA: number, dayB: number) {
  const meals = await readDocs(query(mealsOf(), where('week_plan_id', '==', weekPlanId)));
  await write(async (tx) => {
    for (const m of meals.docs) {
      if (m.data().day === dayA) tx.update(m.ref, { day: dayB });
      else if (m.data().day === dayB) tx.update(m.ref, { day: dayA });
    }
  });
}

/** Note and adjusted ingredients for one evening; pass null ingredients to go back to the recipe. */
export async function updateMealAdjustments(
  mealId: string,
  adjustments: { note: string | null; custom_ingredients: Ingredient[] | null },
) {
  await write(async (tx) => {
    tx.update(doc(mealsOf(), mealId), adjustments);
  });
}

export async function updateMealServings(mealId: string, servings: number) {
  await write(async (tx) => {
    tx.update(doc(mealsOf(), mealId), { servings });
  });
}

export async function removeMeal(mealId: string) {
  await write(async (tx) => {
    tx.delete(doc(mealsOf(), mealId));
  });
}

// ---------- Shopping list ----------

export async function listShoppingChecks(weekPlanId: string): Promise<Set<string>> {
  const snapshot = await readDoc(planRef(await planIdOf(weekPlanId)));
  return new Set((snapshot.data()?.checks ?? []) as string[]);
}

export async function setShoppingCheck(weekPlanId: string, itemKey: string, checked: boolean) {
  const planId = await planIdOf(weekPlanId);
  await write(async (tx) => {
    tx.update(planRef(planId), { checks: checked ? arrayUnion(itemKey) : arrayRemove(itemKey) });
  });
}

export async function listShoppingExtras(weekPlanId: string): Promise<ShoppingExtra[]> {
  const snapshot = await readDocs(query(extrasOf(), where('week_plan_id', '==', await planIdOf(weekPlanId))));
  return snapshot.docs
    .map((d) => withId<ShoppingExtra & { created_at: string }>(d))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function addShoppingExtra(
  forHousehold: string,
  weekStart: string,
  userId: string,
  name: string,
  stapleId?: string,
) {
  await write(async (tx) => {
    const planId = ensurePlan(tx, weekStart);
    tx.set(doc(extrasOf(), newId()), {
      week_plan_id: planId,
      name,
      created_by: userId,
      staple_id: stapleId ?? null,
      quantity: null,
      created_at: now(),
    });
  });
}

/** How many of something added by hand (null: just one). */
export async function setShoppingExtraQuantity(extra: ShoppingExtra, quantity: number | null) {
  await write(async (tx) => {
    tx.update(doc(extrasOf(), extra.id), { quantity });
  });
}

export async function removeShoppingExtra(extra: ShoppingExtra) {
  const planId = await planIdOf(extra.week_plan_id);
  await write(async (tx) => {
    tx.delete(doc(extrasOf(), extra.id));
    tx.update(planRef(planId), { checks: arrayRemove(`extra:${extra.id}`) });
  });
}
