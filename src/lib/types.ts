export type Household = {
  id: string;
  name: string;
  invite_code: string;
  /** Weekday the weeks start on, Monday = 0 ... Sunday = 6. */
  shopping_day: number;
  /** Who chooses the whole week, in turns: one member per week, then from the start again. */
  chooser_rotation: string[];
  /** A week in which the first member of the rotation chooses. */
  rotation_start: string | null;
  /** The family's own AVG choices, next to the standard ones. */
  avg_options: OwnAvgOption[];
  /** The first reminder for whoever chooses: this many days before the shopping day... */
  remind_days_before: number;
  /** ...at this hour (Dutch time), and then every day at that hour until the week is ready. */
  remind_hour: number;
  /** Who does the shopping: they get a notification when the coming week is ready. */
  shopper_ids: string[];
};

/**
 * An AVG choice the family added themselves (the amount is for one person), or with `hidden`
 * a standard choice the family took off the list.
 */
export type OwnAvgOption = {
  group: 'a' | 'g' | 'v' | 'x';
  label: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  hidden?: boolean;
};

export type Profile = {
  id: string;
  display_name: string;
  household_id: string | null;
};

export type Ingredient = {
  id?: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position?: number;
};

export type Recipe = {
  id: string;
  household_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  servings: number;
  prep_minutes: number | null;
  instructions: string | null;
  /** Link to the original recipe on a website. */
  source_url: string | null;
  tags: string[];
  created_at: string;
  author?: { display_name: string } | null;
};

export type RecipeWithIngredients = Recipe & {
  recipe_ingredients: Ingredient[];
};

export type WeekPlan = {
  id: string;
  household_id: string;
  week_start: string;
  /** When whoever chose marked the week as ready; null (or missing) while it isn't. */
  ready_at?: string | null;
  ready_by?: string | null;
};

/** The family's notification settings (see Household). */
export type NotificationSettings = Pick<Household, 'remind_days_before' | 'remind_hour' | 'shopper_ids'>;

/** Who chooses the dish per day of the week (0 = the shopping day); null when nobody does. */
export type DayChoosers = (string | null)[];

/** Choosers set for one week only, per day; undefined where the day follows the rotation. */
export type ChooserOverrides = (string | null | undefined)[];

/** Number of people a dish is planned for, unless you choose otherwise. */
export const DEFAULT_SERVINGS = 4;

export type WeekPlanMeal = {
  id: string;
  week_plan_id: string;
  day: number;
  /** null for a dish without a recipe, such as an AVG. */
  recipe_id: string | null;
  /** Name of a dish without a recipe. */
  title: string | null;
  servings: number;
  /** Note for this evening, e.g. "met kip i.p.v. gehakt". */
  note: string | null;
  /**
   * Ingredients adjusted for this evening only; null means the recipe's own ingredients.
   * For a dish without a recipe: its ingredients for one person.
   */
  custom_ingredients: Ingredient[] | null;
  /** Dishes on the same evening are shown in the order they were added. */
  created_at: string;
  /** For a dish without a recipe, a stand-in recipe for one person (see ownDishRecipe). */
  recipe: RecipeWithIngredients;
};

/** A dish without a recipe, such as an AVG (aardappels, groente, vlees). */
export function isOwnDish(meal: Pick<WeekPlanMeal, 'recipe_id'>): boolean {
  return meal.recipe_id == null;
}

/**
 * Lets the rest of the app treat a dish without a recipe like any other: a recipe for one
 * person with the dish's own name and ingredients, so the shopping list scales it as usual.
 */
export function ownDishRecipe(meal: Pick<WeekPlanMeal, 'id' | 'title' | 'custom_ingredients' | 'created_at'>): RecipeWithIngredients {
  return {
    id: meal.id,
    household_id: '',
    created_by: null,
    title: meal.title ?? 'AVG',
    description: null,
    image_url: null,
    servings: 1,
    prep_minutes: null,
    instructions: null,
    source_url: null,
    tags: [],
    created_at: meal.created_at,
    author: null,
    recipe_ingredients: meal.custom_ingredients ?? [],
  };
}

/** Something added to the shopping list by hand, e.g. "melk" or "2 pakken koffie". */
export type ShoppingExtra = {
  id: string;
  week_plan_id: string;
  name: string;
};

export type RecipeInput = {
  title: string;
  description: string | null;
  image_url: string | null;
  servings: number;
  prep_minutes: number | null;
  instructions: string | null;
  source_url: string | null;
  tags: string[];
  ingredients: Ingredient[];
};

/** The ingredients to cook and shop for: the evening's adjustments, or else the recipe's own. */
export function mealIngredients(meal: WeekPlanMeal): Ingredient[] {
  return meal.custom_ingredients ?? meal.recipe.recipe_ingredients;
}
