import { parseQuantity } from './quantities';
import type { Ingredient } from './types';

/**
 * Reads a recipe from a web page. Almost every recipe site includes the recipe as schema.org
 * "Recipe" data (JSON-LD) for search engines; that is what this reads. No AI involved.
 */
export type ImportedRecipe = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepMinutes: number | null;
  ingredients: Ingredient[];
  instructions: string | null;
  tags: string[];
};

/** Adds https:// when someone pastes "www.site.nl/...", and rejects anything that isn't a web link. */
export function normalizeUrl(input: string): string | null {
  let url = input.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('.') ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function importRecipe(input: string): Promise<ImportedRecipe> {
  const url = normalizeUrl(input);
  if (!url) throw new Error('Dit lijkt geen geldige link.');
  const response = await fetch(url, {
    headers: {
      // Some sites only serve the full page to regular browsers.
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  // Some sites (e.g. Allerhande) refuse requests that don't come from a regular browser.
  if ([401, 403, 429].includes(response.status)) throw new BlockedError();
  if (!response.ok) throw new Error(`De website gaf een foutmelding (${response.status}).`);
  return parseRecipeHtml(await response.text(), url);
}

/** The site refuses automatic fetching (e.g. Allerhande); the recipe has to be filled in by hand. */
export class BlockedError extends Error {
  constructor() {
    super('Deze website staat automatisch ophalen niet toe.');
  }
}

// ---------- Page parsing ----------

type Json = Record<string, unknown>;

export function parseRecipeHtml(html: string, url: string): ImportedRecipe {
  const recipe = findRecipeJson(html);
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'))?.[1] ??
    null;

  if (!recipe) {
    // No recipe data: fall back to the page's title and preview image.
    const title = meta('og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null;
    return {
      url,
      title: title ? clean(title) : null,
      description: meta('og:description') ? clean(meta('og:description')!) : null,
      imageUrl: absoluteUrl(meta('og:image'), url),
      servings: null,
      prepMinutes: null,
      ingredients: [],
      instructions: null,
      tags: [],
    };
  }

  const ingredients = toStringList(recipe.recipeIngredient ?? recipe.ingredients)
    .map(parseIngredientLine)
    .filter((i): i is Ingredient => i !== null);

  const total = parseDuration(recipe.totalTime);
  const parts = (parseDuration(recipe.prepTime) ?? 0) + (parseDuration(recipe.cookTime) ?? 0);

  return {
    url,
    title: typeof recipe.name === 'string' ? clean(recipe.name) : null,
    description: typeof recipe.description === 'string' ? clean(recipe.description) || null : null,
    imageUrl: absoluteUrl(pickImage(recipe.image) ?? meta('og:image'), url),
    servings: parseYield(recipe.recipeYield),
    prepMinutes: total ?? (parts || null),
    ingredients,
    instructions: parseInstructions(recipe.recipeInstructions),
    tags: parseTags(recipe),
  };
}

function findRecipeJson(html: string): Json | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of blocks) {
    try {
      const found = findRecipeNode(JSON.parse(body.trim()));
      if (found) return found;
    } catch {
      // Some sites put invalid JSON here; try the next block.
    }
  }
  return null;
}

function isRecipe(node: Json) {
  const type = node['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

/** The Recipe can be the block itself, inside an array, or inside "@graph". */
function findRecipeNode(node: unknown): Json | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    const obj = node as Json;
    if (isRecipe(obj)) return obj;
    if (obj['@graph']) return findRecipeNode(obj['@graph']);
  }
  return null;
}

// ---------- Field helpers ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°' };

/** Strips HTML tags, decodes entities and tidies whitespace. */
export function clean(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z0-9]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function toStringList(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\n/).map(clean).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(toStringList);
  return [];
}

function pickImage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return pickImage(value[0]);
  if (value && typeof value === 'object') return pickImage((value as Json).url ?? (value as Json).contentUrl);
  return null;
}

function absoluteUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    return new URL(clean(value), base).toString();
  } catch {
    return null;
  }
}

/** ISO 8601 durations like "PT1H30M" → 90 minutes. */
export function parseDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return minutes > 0 ? minutes : null;
}

/** "4", "4 personen", ["4", "4 porties"] → 4. */
function parseYield(value: unknown): number | null {
  if (typeof value === 'number') return value > 0 ? Math.round(value) : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = parseYield(item);
      if (n) return n;
    }
    return null;
  }
  if (typeof value === 'string') {
    const n = Number(value.match(/\d+/)?.[0]);
    return n > 0 && n < 100 ? n : null;
  }
  return null;
}

/** Steps as one per line; handles plain text, HowToStep and HowToSection. */
function parseInstructions(value: unknown): string | null {
  const steps: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') steps.push(...node.split(/\n/).map(clean));
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const obj = node as Json;
      if (obj.itemListElement) walk(obj.itemListElement);
      else if (typeof obj.text === 'string') steps.push(clean(obj.text));
      else if (typeof obj.name === 'string') steps.push(clean(obj.name));
    }
  };
  walk(value);
  const result = steps.filter(Boolean);
  return result.length ? result.join('\n') : null;
}

function parseTags(recipe: Json): string[] {
  const words = [recipe.recipeCategory, recipe.recipeCuisine, recipe.keywords]
    .flatMap((v) => (typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v.map(String) : []))
    .map((t) => clean(t).toLowerCase())
    .filter((t) => t && t.length <= 20);
  return [...new Set(words)].slice(0, 5);
}

// ---------- Ingredient lines ----------

const UNITS = [
  'gram', 'gr', 'g', 'kilogram', 'kilo', 'kg', 'milliliter', 'ml', 'centiliter', 'cl', 'deciliter', 'dl', 'liter', 'l',
  'eetlepels', 'eetlepel', 'el', 'theelepels', 'theelepel', 'tl', 'teentjes', 'teentje', 'tenen', 'teen', 'stuks', 'stuk',
  'blikjes', 'blikje', 'blikken', 'blik', 'potjes', 'potje', 'potten', 'pot', 'zakjes', 'zakje', 'zakken', 'zak',
  'bosjes', 'bosje', 'bos', 'takjes', 'takje', 'plakjes', 'plakken', 'plak', 'snufje', 'snuf', 'scheutje', 'scheut',
  'kopjes', 'kopje', 'kop', 'handjes', 'handje', 'handvol', 'mespuntje', 'mespunt', 'pakjes', 'pakje', 'pak',
  'cups', 'cup', 'tbsp', 'tsp', 'oz', 'lb',
];
const UNIT_PATTERN = new RegExp(`^(${UNITS.join('|')})\\.?(?=\\s|$)`, 'i');
/** Spellings the app writes shorter, so they add up on the shopping list. */
const UNIT_ALIASES: Record<string, string> = {
  gram: 'g', gr: 'g', kilogram: 'kg', kilo: 'kg', milliliter: 'ml', centiliter: 'cl', deciliter: 'dl', liter: 'l',
  eetlepels: 'el', eetlepel: 'el', theelepels: 'tl', theelepel: 'tl', teentjes: 'teentje', tenen: 'teentje', teen: 'teentje',
  stuks: 'stuk', snuf: 'snufje', scheut: 'scheutje', mespuntje: 'mespunt',
};
const FRACTION_CHARS: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' };

/** "500 g gehakt" → { 500, g, gehakt }; "2 teentjes knoflook" → { 2, teentjes, knoflook }; "zout" → { null, null, zout }. */
export function parseIngredientLine(line: string): Ingredient | null {
  let text = clean(line).replace(/(\d)?\s*([½¼¾⅓⅔])/g, (_, whole: string | undefined, f: string) =>
    whole ? `${whole} ${FRACTION_CHARS[f]}` : FRACTION_CHARS[f],
  );
  if (!text) return null;

  let quantity: number | null = null;
  // Fractions first, otherwise "1/2" would be read as "1".
  const q = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*/);
  if (q) {
    quantity = parseQuantity(q[1]);
    text = text.slice(q[0].length);
  }

  let unit: string | null = null;
  const u = text.match(UNIT_PATTERN);
  if (u) {
    unit = UNIT_ALIASES[u[1].toLowerCase()] ?? u[1].toLowerCase();
    text = text.slice(u[0].length).trim();
  }

  // "1 blik (400 g) tomatenblokjes" → "tomatenblokjes"
  const name = text
    .replace(/^\([^)]*\)\s*/, '')
    .replace(/^(van|of)\s+/i, '')
    .trim();
  if (!name) return unit ? { name: unit, quantity, unit: null } : null;
  return { name, quantity, unit };
}
