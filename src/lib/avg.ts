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

/** The standard choices with the family's own added to their group. */
export function avgGroups(own: OwnAvgOption[]): AvgGroup[] {
  return AVG_GROUPS.map((group) => ({
    ...group,
    options: [
      ...group.options,
      ...own
        .filter((o) => o.group === group.key)
        .map((o) => ({ label: o.label, ingredients: [{ name: o.name, quantity: o.quantity, unit: o.unit }] })),
    ],
  }));
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
