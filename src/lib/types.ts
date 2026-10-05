export type Household = {
  id: string;
  name: string;
  invite_code: string;
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
};

/** Who chooses the dish per day, Monday (0) to Sunday (6); null when nobody is assigned yet. */
export type DayChoosers = (string | null)[];

/** Number of people a dish is planned for, unless you choose otherwise. */
export const DEFAULT_SERVINGS = 4;

export type WeekPlanMeal = {
  id: string;
  week_plan_id: string;
  day: number;
  recipe_id: string;
  servings: number;
  /** Note for this evening, e.g. "met kip i.p.v. gehakt". */
  note: string | null;
  /** Ingredients adjusted for this evening only; null means the recipe's own ingredients. */
  custom_ingredients: Ingredient[] | null;
  /** Dishes on the same evening are shown in the order they were added. */
  created_at: string;
  recipe: RecipeWithIngredients;
};

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
