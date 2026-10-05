import { parseQuantity } from './quantities';
import type { ImportedRecipe } from './recipeImport';
import type { Ingredient } from './types';

/**
 * Reads a recipe from pasted text, for example text copied from a screenshot with Live Text
 * (iPhone) or "Tekst selecteren" / Google Lens (Android). Looks for the usual Dutch headings
 * ("Ingrediënten", "Bereiding") and reads amounts like "140 gram volkoren pasta". No AI involved.
 */

const INGREDIENTS_HEADING = /^(ingredi[eë]nt(en)?|benodigdheden|wat heb je nodig|boodschappen(lijst)?)\b/i;
const STEPS_HEADING =
  /^(bereiding(swijze)?|bereiden|aan de slag|werkwijze|zo maak je (het|dit)|instructies|stappen|recept|methode)\b/i;
// Things that come after the recipe itself.
const END_HEADING =
  /^(voedingswaarden?|serveertip|tips?\b|vegatip|weetje|dit heb je nodig|gerelateerde recepten|heb jij dit recept|bekijk ook|meer recepten)/i;

const SERVINGS = /(?:voor\s+)?(\d{1,2})\s*(?:pers(?:onen|oon|\.)?|porties?)\b/i;
const MINUTES = /(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(?:min(?:uten|uut|\.)?)\b/i;

// Units in the ingredient list; the key is what's written, the value what the app stores.
const UNITS: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  kg: 'kg',
  kilo: 'kg',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  liter: 'l',
  el: 'el',
  eetlepel: 'el',
  eetlepels: 'el',
  tl: 'tl',
  theelepel: 'tl',
  theelepels: 'tl',
  snuf: 'snuf',
  snufje: 'snuf',
  mespunt: 'mespunt',
  mespuntje: 'mespunt',
  scheut: 'scheut',
  scheutje: 'scheut',
  blik: 'blik',
  blikje: 'blikje',
  blikken: 'blik',
  pak: 'pak',
  pakje: 'pakje',
  pakken: 'pak',
  zak: 'zak',
  zakje: 'zakje',
  bos: 'bos',
  bosje: 'bosje',
  teen: 'teen',
  teentje: 'teentjes',
  teentjes: 'teentjes',
  tenen: 'teentjes',
  takje: 'takjes',
  takjes: 'takjes',
  plak: 'plakken',
  plakjes: 'plakjes',
  plakken: 'plakken',
  stuk: 'stuks',
  stuks: 'stuks',
  kopje: 'kopje',
  kopjes: 'kopjes',
  handje: 'handje',
  handjevol: 'handje',
  handvol: 'handje',
};

// A number at the start: "2", "1,5", "1/2", "1 1/2", "½", "1½", or a range "1-2" (the first is kept).
const QUANTITY = /^((?:\d+\s+\d+\/\d+)|(?:\d+[.,]?\d*\s*[¼½¾⅓⅔])|(?:\d+\/\d+)|(?:\d+[.,]\d+)|(?:\d+)|[¼½¾⅓⅔])(?:\s*[-–]\s*\d+[.,]?\d*)?/;

/** Removes list bullets, checkboxes and emoji around a line. */
function cleanLine(line: string): string {
  return line
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/^[\s•·\-–*▪▫◦○●□■◻◼▢☐☑✓✔❏❑>]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeading(line: string, heading: RegExp) {
  // Short lines only, so "Recept van oma" in a sentence isn't taken for a heading.
  return heading.test(line) && line.length <= 60;
}

/** "CARPACCIO PASTASALADE" → "Carpaccio pastasalade"; normal titles stay as they are. */
function tidyTitle(line: string): string {
  const title = line.replace(/[:!]+$/, '').trim();
  const letters = title.replace(/[^\p{L}]/gu, '');
  if (letters.length > 3 && letters === letters.toUpperCase()) {
    const lower = title.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return title;
}

/** Lines that are part of an app or website around the recipe, not the recipe itself. */
function isNoise(line: string) {
  return (
    /^#/.test(line) ||
    /^\d{1,2}:\d{2}\b/.test(line) || // a phone's clock
    /^(volgen|follow|delen|bewaar|opslaan|meer|lees meer|kies producten|recept delen)$/i.test(line) ||
    /^\d+\s*(d|u|w|min)\b\s*·/.test(line) // "1 d · ..." under a post
  );
}

export function parseIngredientLine(line: string): Ingredient | null {
  const text = line.replace(/[:;]$/, '').trim();
  if (!text) return null;
  const match = text.match(QUANTITY);
  if (!match) return { name: text.toLowerCase() === text ? text : lowerFirst(text), quantity: null, unit: null };

  const quantity = parseQuantity(match[1].replace(/\s+(?=[¼½¾⅓⅔])/, ''));
  let rest = text.slice(match[0].length).trim();
  let unit: string | null = null;
  const word = rest.match(/^([\p{L}]+)\.?(?=\s|$)/u);
  if (word && UNITS[word[1].toLowerCase()]) {
    unit = UNITS[word[1].toLowerCase()];
    rest = rest.slice(word[0].length).trim();
  }
  rest = rest.replace(/^(van\s+|aan\s+)/i, '').trim();
  if (!rest) return null;
  return { name: lowerFirst(rest), quantity, unit };
}

/** "Rode ui" → "rode ui", but keeps names like "Parmezaanse kaas" readable when all caps. */
function lowerFirst(s: string) {
  if (s === s.toUpperCase()) return s.toLowerCase();
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Puts back together what a screenshot split over several lines. */
function joinIngredientLines(lines: string[]): string[] {
  const joined: string[] = [];
  for (const line of lines) {
    const prev = joined[joined.length - 1];
    // "400 g" on one line and "spaghetti" on the next (a table on a website).
    const prevOnlyAmount = prev != null && parseIngredientLine(prev) === null && QUANTITY.test(prev);
    // "zongedroogde tomaten (op" + "waterbasis)".
    const prevOpenBracket = prev != null && (prev.match(/\(/g)?.length ?? 0) > (prev.match(/\)/g)?.length ?? 0);
    if (prev != null && (prevOnlyAmount || prevOpenBracket) && !QUANTITY.test(line)) {
      joined[joined.length - 1] = `${prev} ${line}`;
    } else {
      joined.push(line);
    }
  }
  return joined;
}

// "1." / "2)" / "Stap 3", or a number on a line of its own (as on Allerhande). Not "2 eieren".
const STEP_NUMBER = /^(?:stap\s*\d{1,2}[.):]?|\d{1,2}\s*[.)])(?:\s+|$)|^\d{1,2}$/i;

/** Steps in order. Numbered steps may continue on the next lines; unnumbered ones end at a full stop. */
function parseSteps(lines: string[]): string[] {
  const numbered = lines.some((l) => STEP_NUMBER.test(l));
  const steps: string[] = [];
  let startNew = true;
  for (const line of lines) {
    const number = numbered ? line.match(STEP_NUMBER) : null;
    const text = (number ? line.slice(number[0].length) : line).trim();
    if (number) startNew = true;
    if (!text) continue;
    const current = steps[steps.length - 1];
    if (startNew || current == null || (!numbered && /[.!?)]$/.test(current))) {
      steps.push(text);
    } else {
      steps[steps.length - 1] = `${current} ${text}`;
    }
    startNew = false;
  }
  return steps.filter((s) => s.length > 2);
}

export function parseRecipeText(input: string): ImportedRecipe {
  const lines = input
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l && !isNoise(l));

  const ingredientsAt = lines.findIndex((l) => isHeading(l, INGREDIENTS_HEADING));
  const stepsAt = lines.findIndex((l, i) => i > ingredientsAt && isHeading(l, STEPS_HEADING));
  const endAt = (from: number) => {
    const i = lines.findIndex((l, index) => index > from && isHeading(l, END_HEADING));
    return i === -1 ? lines.length : i;
  };

  let intro: string[];
  let ingredientLines: string[];
  let stepLines: string[];
  if (ingredientsAt !== -1) {
    intro = lines.slice(0, ingredientsAt);
    const ingredientsEnd = Math.min(stepsAt !== -1 ? stepsAt : lines.length, endAt(ingredientsAt));
    ingredientLines = lines.slice(ingredientsAt + 1, ingredientsEnd);
    stepLines = stepsAt !== -1 ? lines.slice(stepsAt + 1, endAt(stepsAt)) : [];
  } else {
    // No headings: the ingredients are the lines that start with an amount, the steps come after them.
    const looksLikeIngredient = (l: string) =>
      (QUANTITY.test(l) || !!UNITS[l.split(' ')[0].toLowerCase()]) && !STEP_NUMBER.test(l) && !SERVINGS.test(l);
    const first = lines.findIndex(looksLikeIngredient);
    let last = first;
    while (last + 1 < lines.length && looksLikeIngredient(lines[last + 1])) last++;
    intro = first === -1 ? lines : lines.slice(0, first);
    ingredientLines = first === -1 ? [] : lines.slice(first, last + 1);
    const after = first === -1 ? [] : lines.slice(last + 1);
    const stepsHeading = after.findIndex((l) => isHeading(l, STEPS_HEADING));
    stepLines = after.slice(stepsHeading + 1);
    const end = stepLines.findIndex((l) => isHeading(l, END_HEADING));
    if (end !== -1) stepLines = stepLines.slice(0, end);
  }

  // Servings: in the ingredients heading ("Ingrediënten voor 2 pers") or a separate line ("4 persoon").
  let servings: number | null = null;
  const servingsSource = [lines[ingredientsAt] ?? '', ...intro, ...ingredientLines];
  for (const line of servingsSource) {
    const m = line.match(SERVINGS);
    if (m) {
      servings = Number(m[1]);
      break;
    }
  }
  ingredientLines = ingredientLines.filter((l) => !(SERVINGS.test(l) && l.length < 20));

  const minutesLine = intro.find((l) => MINUTES.test(l));
  const minutes = minutesLine?.match(MINUTES);
  const prepMinutes = minutes ? Number(minutes[2] ?? minutes[1]) : null;

  const titleLine = intro.find((l) => /\p{L}{2,}/u.test(l) && l.length <= 80 && !SERVINGS.test(l));

  return {
    url: '',
    title: titleLine ? tidyTitle(titleLine) : null,
    description: null,
    imageUrl: null,
    servings: servings && servings > 0 ? servings : null,
    prepMinutes: prepMinutes && prepMinutes > 0 ? prepMinutes : null,
    ingredients: joinIngredientLines(ingredientLines)
      .map(parseIngredientLine)
      .filter((i): i is Ingredient => i !== null),
    instructions: parseSteps(stepLines).join('\n') || null,
    tags: [],
  };
}
