import { mealIngredients, type Ingredient, type WeekPlanMeal } from './types';

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [0.5, '½'],
  [0.75, '¾'],
  [1 / 3, '⅓'],
  [2 / 3, '⅔'],
];

/** Parses user input like "2", "1,5", "1.5", "1/2", "1 1/2" or "1½". Returns null for empty/invalid. */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!s) return null;
  const unicode = s.match(/^(\d*)\s*([¼½¾⅓⅔])$/);
  if (unicode) {
    const value = FRACTIONS.find(([, symbol]) => symbol === unicode[2])![0];
    return Number(unicode[1] || 0) + value;
  }
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = s.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Formats a quantity Dutch-style: 1,5 → "1½", 0.333 → "⅓", 250 → "250". */
export function formatQuantity(q: number): string {
  if (q >= 10) return String(Math.round(q));
  const whole = Math.floor(q);
  const rest = q - whole;
  if (rest < 0.05) return String(whole);
  if (rest > 0.95) return String(whole + 1);
  for (const [value, symbol] of FRACTIONS) {
    if (Math.abs(rest - value) < 0.04) return whole ? `${whole}${symbol}` : symbol;
  }
  return (Math.round(q * 10) / 10).toString().replace('.', ',');
}

/** Units we can convert to a common base so "500 g" + "1 kg" adds up. */
const UNIT_BASE: Record<string, { base: string; factor: number }> = {
  g: { base: 'g', factor: 1 },
  gr: { base: 'g', factor: 1 },
  gram: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  kilo: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  cl: { base: 'ml', factor: 10 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
  liter: { base: 'ml', factor: 1000 },
};

function normalizeUnit(unit: string | null): { unit: string; factor: number } {
  const u = (unit ?? '').trim().toLowerCase();
  const known = UNIT_BASE[u];
  return known ? { unit: known.base, factor: known.factor } : { unit: u, factor: 1 };
}

export function formatAmount(quantity: number | null, unit: string | null): string {
  if (quantity == null) return unit ?? '';
  let q = quantity;
  let u = unit ?? '';
  if (u === 'g' && q >= 1000) {
    q /= 1000;
    u = 'kg';
  } else if (u === 'ml' && q >= 1000) {
    q /= 1000;
    u = 'l';
  }
  return [formatQuantity(q), u].filter(Boolean).join(' ');
}

export function scaleIngredient(ing: Ingredient, factor: number): Ingredient {
  return { ...ing, quantity: ing.quantity == null ? null : ing.quantity * factor };
}

export type ShoppingItem = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string;
  recipes: string[];
  /** Set for things someone added to the list by hand. */
  extraId?: string;
};

/** Combines the ingredients of all meals in a week, scaled to each meal's number of people. */
export function buildShoppingList(meals: WeekPlanMeal[]): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>();

  for (const meal of meals) {
    const factor = meal.servings / (meal.recipe.servings || 1);
    for (const ing of mealIngredients(meal)) {
      const name = ing.name.trim();
      if (!name) continue;
      const { unit, factor: unitFactor } = normalizeUnit(ing.unit);
      const key = `${name.toLowerCase()}|${unit}`;
      const scaled = ing.quantity == null ? null : ing.quantity * unitFactor * factor;
      // Each dish needs its own whole tin/jar/onion: ½ tin for two dishes is still 2 tins, not 1.
      const amount = scaled != null && isCountable(unit) ? roundForShopping(scaled, unit) : scaled;

      const existing = items.get(key);
      if (existing) {
        if (amount != null) existing.quantity = (existing.quantity ?? 0) + amount;
        if (!existing.recipes.includes(meal.recipe.title)) existing.recipes.push(meal.recipe.title);
      } else {
        items.set(key, { key, name, quantity: amount, unit, recipes: [meal.recipe.title] });
      }
    }
  }

  return [...items.values()]
    .map((item) => ({ ...item, quantity: item.quantity == null ? null : roundForShopping(item.quantity, item.unit) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

const SMALL_UNITS = ['tl', 'el', 'theelepel', 'eetlepel', 'snufje', 'mespunt'];

/** Pieces, tins, jars, cloves...: things you can only use whole. */
function isCountable(unit: string) {
  return unit !== 'g' && unit !== 'ml' && !SMALL_UNITS.includes(unit);
}

/**
 * You can't buy 5¼ eggs or ¾ jar of pesto: pieces, jars, cloves etc. are rounded up to whole
 * numbers, grams and milliliters to a convenient amount (188 g → 190 g).
 */
function roundForShopping(quantity: number, unit: string): number {
  if (unit === 'g' || unit === 'ml') {
    const step = quantity >= 100 ? 10 : 5;
    return Math.max(step, Math.ceil(quantity / step - 0.01) * step);
  }
  // Small units like teaspoons stay as they are.
  if (SMALL_UNITS.includes(unit)) return quantity;
  return Math.max(1, Math.ceil(quantity - 0.05));
}
