import 'expo-sqlite/localStorage/install';
import * as ImagePicker from 'expo-image-picker';

import { dateOfDay, fromISODate, toISODate, weekStartOf, weekdayOf } from './dates';
import { replaceTags } from './tags';
import type {
  ChooserOverrides,
  Household,
  Ingredient,
  OwnAvgOption,
  Profile,
  Recipe,
  RecipeInput,
  RecipeWithIngredients,
  ShoppingExtra,
  WeekPlan,
  WeekPlanMeal,
} from './types';
import { ownDishRecipe } from './types';

// Demo mode: the same functions as api.remote.ts, but all data is kept on the phone.

const STORAGE_KEY = 'weekmenu-demo-v4';
const HOUSEHOLD_ID = 'demo-household';
export const DEMO_USER_ID = 'demo-me';

type RecipeRow = Omit<Recipe, 'author'>;
type IngredientRow = Ingredient & { id: string; recipe_id: string; position: number };
type MealRow = Omit<WeekPlanMeal, 'recipe'>;

type Store = {
  household: Household;
  profiles: Profile[];
  recipes: RecipeRow[];
  ingredients: IngredientRow[];
  favorites: string[];
  plans: WeekPlan[];
  meals: MealRow[];
  /** A week's own choice for a day; chooser_id null means nobody that day. */
  choosers: { week_plan_id: string; day: number; chooser_id: string | null }[];
  checks: { week_plan_id: string; item_key: string }[];
  /** Missing in demo data saved by older versions. */
  extras?: ShoppingExtra[];
};

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- Example data ----------

type Seed = {
  title: string;
  by: string;
  servings: number;
  minutes: number;
  tags: string[];
  description: string;
  ingredients: [number | null, string, string][];
  steps: string[];
};

const SEED: Seed[] = [
  {
    title: 'Lasagne van oma',
    by: 'demo-mama',
    servings: 4,
    minutes: 60,
    tags: ['pasta', 'oven'],
    description: 'Het allerlekkerste recept. Ook de dag erna nog top.',
    ingredients: [
      [500, 'g', 'gehakt'],
      [1, '', 'ui'],
      [2, 'teentje', 'knoflook'],
      [800, 'g', 'tomatenblokjes'],
      [250, 'g', 'lasagnebladen'],
      [150, 'g', 'geraspte kaas'],
    ],
    steps: [
      'Bak het gehakt rul met de ui en knoflook.',
      'Voeg de tomatenblokjes toe en laat 20 minuten pruttelen.',
      'Leg laag om laag saus en lasagnebladen in de schaal en eindig met kaas.',
      'Bak 30 minuten in de oven op 200 °C.',
    ],
  },
  {
    title: 'Pasta pesto met kip',
    by: DEMO_USER_ID,
    servings: 4,
    minutes: 25,
    tags: ['pasta', 'snel'],
    description: 'Snel klaar en iedereen vindt het lekker.',
    ingredients: [
      [400, 'g', 'penne'],
      [300, 'g', 'kipfilet'],
      [1, 'pot', 'groene pesto'],
      [250, 'g', 'cherrytomaatjes'],
    ],
    steps: ['Kook de pasta.', 'Bak de kip in blokjes gaar.', 'Meng alles met de pesto en de gehalveerde tomaatjes.'],
  },
  {
    title: 'Nasi goreng',
    by: 'demo-papa',
    servings: 4,
    minutes: 35,
    tags: [],
    description: 'Met een gebakken eitje erop.',
    ingredients: [
      [300, 'g', 'rijst'],
      [1, '', 'ui'],
      [300, 'g', 'kipfilet'],
      [4, '', 'eieren'],
      [1, 'zak', 'nasigroente'],
    ],
    steps: [
      'Kook de rijst en laat afkoelen.',
      'Bak ui en kip, voeg de groente toe.',
      'Roerbak de rijst erdoor.',
      'Bak de eieren en leg ze erop.',
    ],
  },
  {
    title: 'Wraps met kip',
    by: DEMO_USER_ID,
    servings: 4,
    minutes: 20,
    tags: ['snel'],
    description: 'Iedereen maakt zijn eigen wrap.',
    ingredients: [
      [8, '', 'wraps'],
      [400, 'g', 'kipfilet'],
      [1, '', 'paprika'],
      [150, 'g', 'geraspte kaas'],
    ],
    steps: ['Bak de kip met de paprika in reepjes.', 'Verwarm de wraps.', 'Zet alles op tafel en vul zelf je wrap.'],
  },
  {
    title: 'Pannenkoeken',
    by: 'demo-papa',
    servings: 4,
    minutes: 30,
    tags: ['zoet'],
    description: 'Met stroop of poedersuiker.',
    ingredients: [
      [400, 'g', 'bloem'],
      [750, 'ml', 'melk'],
      [3, '', 'eieren'],
      [null, '', 'stroop'],
    ],
    steps: ['Klop bloem, melk en eieren tot een glad beslag.', 'Bak dunne pannenkoeken in een hete pan.'],
  },
  {
    title: 'Chili con carne',
    by: 'demo-papa',
    servings: 4,
    minutes: 45,
    tags: [],
    description: 'Lekker pittig, met rijst.',
    ingredients: [
      [1, 'kg', 'gehakt'],
      [2, '', 'ui'],
      [1, 'blik', 'kidneybonen'],
      [800, 'g', 'tomatenblokjes'],
      [300, 'g', 'rijst'],
    ],
    steps: [
      'Bak het gehakt met de ui.',
      'Voeg tomaten en bonen toe en laat 30 minuten zachtjes koken.',
      'Serveer met rijst.',
    ],
  },
  {
    title: 'Zalm uit de oven',
    by: 'demo-mama',
    servings: 2,
    minutes: 30,
    tags: ['vis', 'oven'],
    description: 'Gezond en makkelijk.',
    ingredients: [
      [2, '', 'zalmfilets'],
      [500, 'g', 'krieltjes'],
      [250, 'g', 'sperziebonen'],
    ],
    steps: ['Bak de krieltjes 15 minuten voor in de oven.', 'Leg de zalm erbij en bak nog 15 minuten.', 'Kook de sperziebonen.'],
  },
];

function seedStore(): Store {
  const store: Store = {
    household: {
      id: HOUSEHOLD_ID,
      name: 'Demo-gezin',
      invite_code: 'DEMO42',
      shopping_day: 0,
      // Mum chooses this week, then the demo user, then dad, and so on.
      chooser_rotation: ['demo-mama', DEMO_USER_ID, 'demo-papa'],
      rotation_start: weekStartOf(),
      avg_options: [],
    },
    profiles: [
      { id: 'demo-mama', display_name: 'Mama', household_id: HOUSEHOLD_ID },
      { id: 'demo-papa', display_name: 'Papa', household_id: HOUSEHOLD_ID },
      { id: DEMO_USER_ID, display_name: 'Vivian', household_id: HOUSEHOLD_ID },
    ],
    recipes: [],
    ingredients: [],
    favorites: [],
    plans: [],
    meals: [],
    choosers: [],
    checks: [],
  };

  const now = Date.now();
  const ids = SEED.map((seed, i) => {
    const id = newId();
    store.recipes.push({
      id,
      household_id: HOUSEHOLD_ID,
      created_by: seed.by,
      title: seed.title,
      description: seed.description,
      image_url: null,
      servings: seed.servings,
      prep_minutes: seed.minutes,
      instructions: seed.steps.join('\n'),
      source_url: null,
      tags: seed.tags,
      created_at: new Date(now - i * 60_000).toISOString(),
    });
    seed.ingredients.forEach(([quantity, unit, name], position) =>
      store.ingredients.push({ id: newId(), recipe_id: id, name, quantity, unit: unit || null, position }),
    );
    return id;
  });
  store.favorites = [ids[0], ids[1], ids[4]];

  // This week is already partly planned, as a mixed week.
  const plan: WeekPlan = { id: newId(), household_id: HOUSEHOLD_ID, week_start: weekStartOf() };
  store.plans.push(plan);
  const planned: [number, number, number][] = [
    [0, 1, 3],
    [1, 2, 3],
    [2, 3, 3],
    [3, 0, 5],
    [5, 4, 3],
  ];
  for (const [day, recipeIndex, servings] of planned) {
    store.meals.push({
      id: newId(),
      week_plan_id: plan.id,
      day,
      recipe_id: ids[recipeIndex],
      title: null,
      servings,
      note: null,
      custom_ingredients: null,
      created_at: new Date().toISOString(),
    });
  }
  // It's mum's turn, but the demo user swapped with her for Monday and Wednesday.
  for (const day of [0, 2]) store.choosers.push({ week_plan_id: plan.id, day, chooser_id: DEMO_USER_ID });
  return store;
}

// ---------- Storage ----------

let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cache = JSON.parse(raw) as Store;
  } catch {
    cache = null;
  }
  if (!cache) {
    cache = seedStore();
    save();
  }
  return cache;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Keep working in memory if storage is unavailable.
  }
}

function mutate<T>(fn: (store: Store) => T): T {
  const result = fn(load());
  save();
  return result;
}

export function resetDemo() {
  cache = seedStore();
  save();
}

export function getDemoSession() {
  const store = load();
  return {
    profile: store.profiles.find((p) => p.id === DEMO_USER_ID)!,
    household: store.household,
    members: [...store.profiles].sort((a, b) => a.display_name.localeCompare(b.display_name, 'nl')),
  };
}

// ---------- Helpers ----------

function withAuthor(store: Store, recipe: RecipeRow): Recipe {
  const author = store.profiles.find((p) => p.id === recipe.created_by);
  return { ...recipe, tags: [...recipe.tags], author: author ? { display_name: author.display_name } : null };
}

function withIngredients(store: Store, recipe: RecipeRow): RecipeWithIngredients {
  return {
    ...withAuthor(store, recipe),
    recipe_ingredients: store.ingredients
      .filter((i) => i.recipe_id === recipe.id)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ ...i })),
  };
}

function findPlan(store: Store, weekStart: string) {
  return store.plans.find((p) => p.week_start === weekStart) ?? null;
}

function ensurePlan(store: Store, weekStart: string): WeekPlan {
  let plan = findPlan(store, weekStart);
  if (!plan) {
    plan = { id: newId(), household_id: HOUSEHOLD_ID, week_start: weekStart };
    store.plans.push(plan);
  }
  return plan;
}

// ---------- Profile ----------

export async function updateDisplayName(userId: string, displayName: string) {
  mutate((s) => {
    const profile = s.profiles.find((p) => p.id === userId);
    if (profile) profile.display_name = displayName;
  });
}

// ---------- Recipes ----------

export async function listRecipes(): Promise<Recipe[]> {
  const store = load();
  return [...store.recipes]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => withAuthor(store, r));
}

/**
 * Replaces labels in every recipe of the household: merging and renaming (to a label) or
 * removing (to null).
 */
export async function replaceTagsEverywhere(from: string[], to: string | null) {
  mutate((s) => {
    for (const recipe of s.recipes) recipe.tags = replaceTags(recipe.tags, from, to);
  });
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients> {
  const store = load();
  const recipe = store.recipes.find((r) => r.id === id);
  if (!recipe) throw new Error('Recept niet gevonden');
  return withIngredients(store, recipe);
}

export async function saveRecipe(
  input: RecipeInput,
  ctx: { householdId: string; userId: string },
  existingId?: string,
): Promise<string> {
  const { ingredients, ...fields } = input;
  return mutate((s) => {
    let id = existingId;
    if (id) {
      const recipe = s.recipes.find((r) => r.id === id);
      if (!recipe) throw new Error('Recept niet gevonden');
      Object.assign(recipe, fields);
      s.ingredients = s.ingredients.filter((i) => i.recipe_id !== id);
    } else {
      id = newId();
      s.recipes.push({
        ...fields,
        id,
        household_id: ctx.householdId,
        created_by: ctx.userId,
        created_at: new Date().toISOString(),
      });
    }
    ingredients
      .filter((i) => i.name.trim())
      .forEach((i, position) =>
        s.ingredients.push({
          id: newId(),
          recipe_id: id!,
          name: i.name.trim(),
          quantity: i.quantity,
          unit: i.unit?.trim() || null,
          position,
        }),
      );
    return id;
  });
}

export async function deleteRecipe(id: string) {
  mutate((s) => {
    s.recipes = s.recipes.filter((r) => r.id !== id);
    s.ingredients = s.ingredients.filter((i) => i.recipe_id !== id);
    s.favorites = s.favorites.filter((f) => f !== id);
    s.meals = s.meals.filter((m) => m.recipe_id !== id);
  });
}

/** In demo mode the photo stays on the phone instead of being uploaded. */
export async function pickAndUploadImage(_householdId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.6,
  });
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

// ---------- Favorites ----------

export async function listFavoriteIds(_userId: string): Promise<Set<string>> {
  return new Set(load().favorites);
}

export async function setFavorite(_userId: string, recipeId: string, favorite: boolean) {
  mutate((s) => {
    s.favorites = s.favorites.filter((f) => f !== recipeId);
    if (favorite) s.favorites.push(recipeId);
  });
}

// ---------- Week plans ----------

export async function getWeekPlan(
  weekStart: string,
): Promise<{ plan: WeekPlan | null; meals: WeekPlanMeal[]; chooserOverrides: ChooserOverrides }> {
  const store = load();
  const chooserOverrides: ChooserOverrides = Array(7).fill(undefined);
  const plan = findPlan(store, weekStart);
  if (!plan) return { plan: null, meals: [], chooserOverrides };
  const meals = store.meals
    .filter((m) => m.week_plan_id === plan.id)
    // Demo data saved by older versions has no created_at.
    .map((m) => ({ ...m, created_at: m.created_at ?? '' }))
    .sort((a, b) => a.day - b.day || a.created_at.localeCompare(b.created_at))
    .flatMap((m) => {
      if (m.recipe_id == null) return [{ ...m, recipe: ownDishRecipe(m) }];
      const recipe = store.recipes.find((r) => r.id === m.recipe_id);
      return recipe ? [{ ...m, recipe: withIngredients(store, recipe) }] : [];
    });
  for (const c of store.choosers) if (c.week_plan_id === plan.id) chooserOverrides[c.day] = c.chooser_id;
  return { plan: { ...plan }, meals, chooserOverrides };
}

/** Adds a dish to an evening; an evening can have more than one dish. */
export async function addMeal(_householdId: string, weekStart: string, day: number, recipeId: string, servings: number) {
  mutate((s) => {
    const plan = ensurePlan(s, weekStart);
    s.meals.push({
      id: newId(),
      week_plan_id: plan.id,
      day,
      recipe_id: recipeId,
      title: null,
      servings,
      note: null,
      custom_ingredients: null,
      created_at: new Date().toISOString(),
    });
  });
}

/** Puts another recipe in place of a planned dish. */
export async function replaceMeal(mealId: string, recipeId: string, servings: number) {
  mutate((s) => {
    const meal = s.meals.find((m) => m.id === mealId);
    // A new dish starts without the previous dish's adjustments.
    if (meal) Object.assign(meal, { recipe_id: recipeId, title: null, servings, note: null, custom_ingredients: null });
  });
}

/** Adds a dish without a recipe, such as an AVG; `ingredients` are for one person. */
export async function addOwnDish(
  _householdId: string,
  weekStart: string,
  day: number,
  title: string,
  ingredients: Ingredient[],
  servings: number,
) {
  mutate((s) => {
    const plan = ensurePlan(s, weekStart);
    s.meals.push({
      id: newId(),
      week_plan_id: plan.id,
      day,
      recipe_id: null,
      title,
      servings,
      note: null,
      custom_ingredients: ingredients,
      created_at: new Date().toISOString(),
    });
  });
}

/** Changes an AVG, or puts one in place of a planned dish; `ingredients` are for one person. */
export async function updateOwnDish(mealId: string, title: string, ingredients: Ingredient[], servings: number) {
  mutate((s) => {
    const meal = s.meals.find((m) => m.id === mealId);
    if (meal) Object.assign(meal, { recipe_id: null, title, custom_ingredients: ingredients, servings, note: null });
  });
}

/** Sets who chooses on the given days of one week; null means nobody, also when it's someone's turn. */
export async function setDayChoosers(_householdId: string, weekStart: string, days: number[], chooserId: string | null) {
  mutate((s) => {
    const plan = ensurePlan(s, weekStart);
    s.choosers = s.choosers.filter((c) => !(c.week_plan_id === plan.id && days.includes(c.day)));
    for (const day of days) s.choosers.push({ week_plan_id: plan.id, day, chooser_id: chooserId });
  });
}

/** The given days of one week follow the rotation again. */
export async function resetDayChoosers(weekStart: string, days: number[]) {
  mutate((s) => {
    const plan = findPlan(s, weekStart);
    if (plan) s.choosers = s.choosers.filter((c) => !(c.week_plan_id === plan.id && days.includes(c.day)));
  });
}

/** Who chooses the whole week in turns, starting with whoever chooses the week of `rotationStart`. */
export async function saveChooserRotation(_householdId: string, rotation: string[], rotationStart: string) {
  mutate((s) => Object.assign(s.household, { chooser_rotation: rotation, rotation_start: rotationStart }));
}

/** The family's own AVG choices, next to the standard ones. */
export async function saveAvgOptions(_householdId: string, options: OwnAvgOption[]) {
  mutate((s) => {
    s.household.avg_options = options;
  });
}

/** Weeks start on the shopping day; everything planned moves along and keeps its date (as set_shopping_day). */
export async function setShoppingDay(_householdId: string, day: number) {
  mutate((s) => {
    s.household.shopping_day = day;
    const startOf = (date: Date) => {
      const copy = new Date(date);
      copy.setDate(copy.getDate() - ((weekdayOf(copy) - day + 7) % 7));
      return toISODate(copy);
    };
    /** The new week holding `date`, and the date's day in it. */
    const place = (date: Date) => {
      const plan = ensurePlan(s, startOf(date));
      return { plan, day: Math.round((date.getTime() - fromISODate(plan.week_start).getTime()) / 86_400_000) };
    };
    const old = s.plans.filter((p) => p.week_start !== startOf(fromISODate(p.week_start)));
    for (const p of old) {
      for (const m of s.meals.filter((m) => m.week_plan_id === p.id)) {
        const to = place(dateOfDay(p.week_start, m.day));
        Object.assign(m, { week_plan_id: to.plan.id, day: to.day });
      }
      for (const c of s.choosers.filter((c) => c.week_plan_id === p.id)) {
        const to = place(dateOfDay(p.week_start, c.day));
        if (!s.choosers.some((o) => o.week_plan_id === to.plan.id && o.day === to.day)) {
          s.choosers.push({ week_plan_id: to.plan.id, day: to.day, chooser_id: c.chooser_id });
        }
      }
      // The shopping list's own items and ticks go to the new week that holds most of the old one.
      const middle = place(dateOfDay(p.week_start, 3)).plan;
      for (const e of s.extras ?? []) if (e.week_plan_id === p.id) e.week_plan_id = middle.id;
      for (const c of s.checks.filter((c) => c.week_plan_id === p.id)) {
        if (!s.checks.some((o) => o.week_plan_id === middle.id && o.item_key === c.item_key)) {
          s.checks.push({ week_plan_id: middle.id, item_key: c.item_key });
        }
      }
    }
    const oldIds = new Set(old.map((p) => p.id));
    s.plans = s.plans.filter((p) => !oldIds.has(p.id));
    s.choosers = s.choosers.filter((c) => !oldIds.has(c.week_plan_id));
    s.checks = s.checks.filter((c) => !oldIds.has(c.week_plan_id));
  });
}

/** Swaps all dishes of two evenings of the same week. */
export async function swapDays(weekPlanId: string, dayA: number, dayB: number) {
  mutate((s) => {
    for (const meal of s.meals) {
      if (meal.week_plan_id !== weekPlanId) continue;
      if (meal.day === dayA) meal.day = dayB;
      else if (meal.day === dayB) meal.day = dayA;
    }
  });
}

/** Note and adjusted ingredients for one evening; pass null ingredients to go back to the recipe. */
export async function updateMealAdjustments(
  mealId: string,
  adjustments: { note: string | null; custom_ingredients: Ingredient[] | null },
) {
  mutate((s) => {
    const meal = s.meals.find((m) => m.id === mealId);
    if (meal) Object.assign(meal, adjustments);
  });
}

export async function updateMealServings(mealId: string, servings: number) {
  mutate((s) => {
    const meal = s.meals.find((m) => m.id === mealId);
    if (meal) meal.servings = servings;
  });
}

export async function removeMeal(mealId: string) {
  mutate((s) => {
    s.meals = s.meals.filter((m) => m.id !== mealId);
  });
}

// ---------- Shopping list ----------

export async function listShoppingChecks(weekPlanId: string): Promise<Set<string>> {
  return new Set(load().checks.filter((c) => c.week_plan_id === weekPlanId).map((c) => c.item_key));
}

export async function setShoppingCheck(weekPlanId: string, itemKey: string, checked: boolean) {
  mutate((s) => {
    s.checks = s.checks.filter((c) => !(c.week_plan_id === weekPlanId && c.item_key === itemKey));
    if (checked) s.checks.push({ week_plan_id: weekPlanId, item_key: itemKey });
  });
}

export async function listShoppingExtras(weekPlanId: string): Promise<ShoppingExtra[]> {
  return (load().extras ?? []).filter((e) => e.week_plan_id === weekPlanId).map((e) => ({ ...e }));
}

export async function addShoppingExtra(_householdId: string, weekStart: string, _userId: string, name: string) {
  mutate((s) => {
    const plan = ensurePlan(s, weekStart);
    s.extras = [...(s.extras ?? []), { id: newId(), week_plan_id: plan.id, name }];
  });
}

export async function removeShoppingExtra(extra: ShoppingExtra) {
  mutate((s) => {
    s.extras = (s.extras ?? []).filter((e) => e.id !== extra.id);
    s.checks = s.checks.filter((c) => !(c.week_plan_id === extra.week_plan_id && c.item_key === `extra:${extra.id}`));
  });
}
