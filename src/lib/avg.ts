import type { Ingredient, OwnAvgOption } from './types';

/**
 * The building blocks of an AVG (aardappels, groente, vlees), with what one person usually
 * eats. Choosing them puts these amounts, times the number of people, on the shopping list.
 */
export type AvgOption = { label: string; ingredients: Ingredient[] };
/** `inTitle`: the group's choices make up the dish's name (not the extras, like jus). */
export type AvgGroup = { key: 'a' | 'g' | 'v' | 'x'; title: string; inTitle: boolean; options: AvgOption[] };

const item = (label: string, quantity: number | null, unit: string | null, name = label.toLowerCase()): AvgOption => ({
  label,
  ingredients: [{ name, quantity, unit }],
});

export const AVG_GROUPS: AvgGroup[] = [
  {
    key: 'a',
    title: 'Aardappels',
    inTitle: true,
    options: [
      item('Gekookte aardappels', 250, 'g', 'aardappels'),
      item('Puree', 250, 'g', 'kruimige aardappels'),
      item('Gebakken aardappels', 250, 'g', 'vastkokende aardappels'),
      item('Krieltjes', 200, 'g'),
      item('Ovenfriet', 200, 'g'),
      item('Aardappelpartjes', 200, 'g'),
      item('Zoete aardappel', 250, 'g'),
      item('Gnocchi', 125, 'g'),
      item('Rijst', 75, 'g'),
      item('Pasta', 90, 'g'),
    ],
  },
  {
    key: 'g',
    title: 'Groente',
    inTitle: true,
    options: [
      item('Sperziebonen', 200, 'g'),
      item('Broccoli', 200, 'g'),
      item('Bloemkool', 200, 'g'),
      item('Worteltjes', 200, 'g'),
      item('Doperwten', 150, 'g'),
      item('Spinazie', 250, 'g'),
      item('Rode kool', 150, 'g'),
      item('Spruitjes', 200, 'g'),
      item('Andijvie', 200, 'g'),
      item('Witlof', 200, 'g'),
      item('Prei', 200, 'g'),
      item('Courgette', 200, 'g'),
      item('Paprika', 1, null, 'paprika'),
      item('Champignons', 100, 'g'),
      item('Sla', 50, 'g'),
      item('Komkommer', 0.25, null, 'komkommer'),
    ],
  },
  {
    key: 'v',
    title: 'Vlees, vis of vega',
    inTitle: true,
    options: [
      item('Gehaktballen', 125, 'g', 'gehakt'),
      item('Kipfilet', 125, 'g'),
      item('Kippendijen', 150, 'g'),
      item('Kippenpoten', 1, null, 'kippenpoten'),
      item('Slavinken', 1, null, 'slavinken'),
      item('Speklap', 1, null, 'speklappen'),
      item('Karbonade', 1, null, 'karbonades'),
      item('Schnitzel', 1, null, 'schnitzels'),
      item('Hamburger', 1, null, 'hamburgers'),
      item('Braadworst', 1, null, 'braadworsten'),
      item('Rookworst', 0.25, null, 'rookworst'),
      item('Biefstuk', 125, 'g'),
      item('Visfilet', 125, 'g'),
      item('Zalm', 125, 'g', 'zalmfilet'),
      item('Vegaburger', 1, null, 'vegaburgers'),
      item('Gebakken ei', 2, null, 'eieren'),
    ],
  },
  {
    key: 'x',
    title: 'Erbij',
    inTitle: false,
    options: [
      item('Jus', 0.25, 'zakje', 'jus'),
      item('Appelmoes', 100, 'g'),
      item('Gebakken uitjes', 10, 'g'),
      item('Mosterd', null, null),
      item('Mayonaise', null, null),
    ],
  },
];

/**
 * The choices per group: the standard ones the family didn't hide plus their own, the most
 * used first (`usage`: how often each ingredient was in a planned AVG).
 */
export function avgGroups(own: OwnAvgOption[], usage: Record<string, number> = {}): AvgGroup[] {
  const hidden = new Set(own.filter((o) => o.hidden).map((o) => `${o.group}:${o.label}`));
  const used = (option: AvgOption) => usage[option.ingredients[0].name] ?? 0;
  return AVG_GROUPS.map((group) => ({
    ...group,
    options: [
      ...group.options.filter((o) => !hidden.has(`${group.key}:${o.label}`)),
      ...own
        .filter((o) => o.group === group.key && !o.hidden)
        .map((o) => ({ label: o.label, ingredients: [{ name: o.name, quantity: o.quantity, unit: o.unit }] })),
    ]
      // Stable: equally used choices keep their usual order.
      .map((option, index) => ({ option, index }))
      .sort((a, b) => used(b.option) - used(a.option) || a.index - b.index)
      .map(({ option }) => option),
  }));
}

/** Standard choices the family hid, per group, so they can be put back. */
export function hiddenAvgOptions(own: OwnAvgOption[], group: AvgGroup['key']): AvgOption[] {
  const hidden = new Set(own.filter((o) => o.hidden && o.group === group).map((o) => o.label));
  return AVG_GROUPS.find((g) => g.key === group)!.options.filter((o) => hidden.has(o.label));
}

/** How often each ingredient was in a planned AVG. */
export function countAvgUsage(dishes: Ingredient[][]): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const ingredients of dishes) {
    for (const ing of ingredients) usage[ing.name] = (usage[ing.name] ?? 0) + 1;
  }
  return usage;
}

/** The option whose ingredient has this name, to recognise a saved AVG. */
export function findAvgOption(groups: AvgGroup[], ingredientName: string): { group: AvgGroup; option: AvgOption } | null {
  for (const group of groups) {
    const option = group.options.find((o) => o.ingredients[0].name === ingredientName);
    if (option) return { group, option };
  }
  return null;
}

/** "Krieltjes, sperziebonen en slavinken". */
export function avgTitle(labels: string[]): string {
  const parts = labels.map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1)));
  if (parts.length <= 1) return parts[0] ?? 'AVG';
  return `${parts.slice(0, -1).join(', ')} en ${parts[parts.length - 1]}`;
}
