import type { IconName } from '@/components/ui';

/**
 * The shopping list in the order you walk through a typical Dutch supermarket. Products are
 * recognised by words in their name; the family can move a product to another aisle, which is
 * remembered (household.aisle_overrides).
 */
export type AisleKey =
  | 'groente'
  | 'brood'
  | 'vlees'
  | 'beleg'
  | 'zuivel'
  | 'wereld'
  | 'conserven'
  | 'kruiden'
  | 'ontbijt'
  | 'snoep'
  | 'dranken'
  | 'diepvries'
  | 'huishouden'
  | 'overig';

export type Aisle = { key: AisleKey; label: string; icon: IconName; words: string[] };

// Words are matched anywhere in the name ("rundergehakt" has "gehakt"), ignoring accents and
// anything in brackets or after a comma ("kipfilet (in stukjes)"). A match inside a longer one
// doesn't count ("kokosmelk" is not melk). Of the rest the last one wins, because in Dutch the
// product comes last: "tomatensoep" is soup, "witte wijnazijn" is vinegar. A word starting with ^
// only matches at the start of a word, for short words like "ui" (not in "fruit" or "kruiden").
// Brands that sit in one aisle win from any word (BRANDS).
export const AISLES: Aisle[] = [
  {
    key: 'groente',
    label: 'Groente & fruit',
    icon: 'leaf-outline',
    words: [
      'aardappel', 'kriel', '^ui', 'uien', 'sjalot', 'knoflook', 'prei', 'wortel', 'peen', 'paprika', 'tomaat',
      'tomaten', 'komkommer', 'courgette', 'aubergine', 'broccoli', 'bloemkool', 'spinazie', '^sla', 'rucola',
      'veldsla', 'ijsberg', 'andijvie', 'witlof', 'spruit', 'sperzieboon', 'sperziebonen', 'snijbonen', 'boontjes', 'peultjes',
      'champignon', 'paddenstoel', 'kool', 'avocado', 'citroen', 'limoen', 'sinaasappel', 'mandarijn', 'appel',
      'peer', 'peren', 'banaan', 'bananen', 'druif', 'druiven', 'aardbei', 'framboos', 'frambozen', 'bessen',
      'mango', 'ananas', 'kiwi', 'meloen', 'gember', 'verse', 'peterselie', 'basilicum', 'koriander', 'bieslook',
      'dille', 'munt', 'lente-ui', 'bosui', 'selderij', 'venkel', 'radijs', 'biet', 'pompoen', 'taugé', 'asperge',
      'maiskolf', 'groente', 'fruit', 'salade', 'doperwten', 'erwten', 'boerenkool', 'zuurkool', 'zoete aardappel',
      'penen', 'perzik', 'nectarine', 'pruimen', 'bleekselderij', 'koolmix',
    ],
  },
  {
    key: 'brood',
    label: 'Brood & bakkerij',
    icon: 'basket-outline',
    words: [
      'brood', 'stokbrood', 'bolletjes', 'broodjes', 'croissant', 'pistolet', 'naan', 'pita', 'ciabatta', 'focaccia',
      'hamburgerbroodjes', 'krentenbol', 'afbakbrood', 'boterham', 'flatbread', 'tijgerbrood',
    ],
  },
  {
    key: 'vlees',
    label: 'Vlees, vis & vega',
    icon: 'fish-outline',
    words: [
      '^kip', 'kipfilet', 'kippendij', 'kippenpoot', 'kippenpoten', 'drumstick', 'gehakt', 'gehaktbal', 'biefstuk',
      'rundvlees', 'varkens', 'speklap', '^spek', 'spekreepjes', 'spekjes', 'ontbijtspek', 'bacon', 'karbonade',
      'schnitzel', 'hamburger', 'braadworst', 'slavink', 'worst', 'rookworst', 'shoarma', 'gyros', 'kalkoen',
      'lamsvlees', 'sucade', 'stoofvlees', 'riblap', 'saté', 'zalm', '^vis', 'visfilet', 'kabeljauw', 'pangasius',
      'tilapia', 'koolvis', 'garnaal', 'garnalen', 'scampi', 'mosselen', 'vegaburger', 'vega', 'tofu', 'tempeh',
      'vegetarisch', 'falafel', 'kipstukjes', 'vleesvervanger',
    ],
  },
  {
    key: 'beleg',
    label: 'Kaas, vleeswaren & tapas',
    icon: 'pizza-outline',
    words: [
      'kaas', 'geraspte kaas', 'parmezaan', 'parmigiano', 'mozzarella', 'feta', 'geitenkaas', 'cheddar', 'gouda',
      'brie', 'ricotta', '^ham', 'salami', 'chorizo', 'rookvlees', 'filet americain', 'carpaccio', 'hummus',
      'olijven', 'tapenade', 'smeerkaas', 'roomkaas', 'vleeswaren', 'achterham', 'beenham', 'kipfilet vleeswaren',
    ],
  },
  {
    key: 'zuivel',
    label: 'Zuivel & eieren',
    icon: 'egg-outline',
    words: [
      'melk', 'karnemelk', 'yoghurt', 'kwark', '^vla', 'room', 'slagroom', 'kookroom', 'kookzuivel', 'crème fraîche',
      'creme fraiche', 'zure room', 'boter', 'roomboter', 'margarine', '^ei', 'eieren', 'mascarpone', 'toetje',
      'skyr', 'zuivel', 'sour cream',
    ],
  },
  {
    key: 'wereld',
    label: 'Pasta, rijst & wereldkeuken',
    icon: 'restaurant-outline',
    words: [
      'pasta', 'spaghetti', 'penne', 'macaroni', 'fusilli', 'tagliatelle', 'lasagne', 'lasagnebladen', 'noedels',
      '^mie', 'rijst', 'basmati', 'couscous', 'bulgur', 'quinoa', 'tortilla', 'wrap', 'taco', 'nacho', 'kokosmelk',
      'sojasaus', 'ketjap', 'sambal', 'currypasta', 'curry', 'sweet chili', 'oestersaus', 'vissaus', 'pesto',
      'gnocchi', 'risotto', 'wokolie', 'kroepoek', 'pindasaus', 'satésaus', 'conimex', 'old el paso', 'santa maria',
      'wokmix', 'nasimix', 'bamimix', 'noodles', 'noedels', 'udon', 'ramen', 'chilisaus', 'sweet chilisaus', 'woksaus',
      'rotisaus', 'guacamole', 'sesamolie', 'chili olie', 'chiliolie', 'rijstazijn', 'sushi', 'flatbread wraps',
    ],
  },
  {
    key: 'conserven',
    label: 'Conserven, soep & sauzen',
    icon: 'albums-outline',
    words: [
      'tomatenpuree', 'passata', 'gepelde tomaten', 'tomatenblokjes', 'tomatensaus', 'kidneybonen', 'kikkererwten',
      'witte bonen', 'bruine bonen', 'linzen', '^mais', 'appelmoes', 'augurk', 'zilveruitjes', 'soep', 'bouillon',
      '^jus', 'mayonaise', 'ketchup', 'mosterd', 'saus', 'tonijn', 'ansjovis', 'kappertjes', 'zongedroogde tomaten',
      'blik', 'rode bieten', 'gesneden bieten', 'gezeefde tomaten', 'puree', 'purree', 'zwarte bonen', 'bonen in tomatensaus',
      'bouillon kruiden', 'bouillonkruiden', 'bouillonblokje',
      // Brands of sauces, soups and mixes.
      'unox', "grand'italia", 'grand italia', 'bertolli', 'calvé', 'calve', 'heinz', 'remia', 'mix voor',
      'van der meulen',
    ],
  },
  {
    key: 'kruiden',
    label: 'Kruiden, olie & bakken',
    icon: 'flask-outline',
    words: [
      'zout', 'peper', 'paprikapoeder', 'kerrie', 'komijn', 'kaneel', 'nootmuskaat', 'oregano', 'gedroogde',
      'italiaanse kruiden', 'kruiden', 'kruidenmix', 'olie', 'olijfolie', 'zonnebloemolie', 'azijn', 'wijnazijn',
      'balsamico', 'bloem', 'meel', 'suiker', 'bakpoeder', 'gist', 'vanille', 'maizena', 'paneermeel',
      'pijnboompitten', 'noten', 'cashew', 'walnoten', 'amandel', 'gebakken uitjes', 'kruidnagel', 'laurier',
      'chilivlokken', 'knoflookpoeder', 'uienpoeder', 'tijm', 'rozemarijn', 'bakpapier', 'cacao', 'sesamzaad',
      'pindas', "pinda's", 'rozijnen', 'chilipoeder', 'poeder', 'basterdsuiker', 'pannenkoek', 'pannenkoekenmix',
      'cakemix', 'bakmix',
    ],
  },
  {
    key: 'ontbijt',
    label: 'Ontbijt, beleg & koffie',
    icon: 'cafe-outline',
    words: [
      'hagelslag', 'pindakaas', '^jam', 'honing', 'muesli', 'cornflakes', 'havermout', 'ontbijtkoek', 'beschuit',
      'crackers', 'koffie', '^thee', 'granola', 'appelstroop', 'chocoladepasta', 'vlokken', 'cruesli',
    ],
  },
  {
    key: 'snoep',
    label: 'Koek, snoep & chips',
    icon: 'ice-cream-outline',
    words: ['chips', 'koek', 'koekjes', 'chocolade', 'snoep', 'drop', 'nootjes', 'popcorn', 'stroopwafel', 'zoutjes', 'snack'],
  },
  {
    key: 'dranken',
    label: 'Dranken',
    icon: 'beer-outline',
    words: [
      '^water', 'spa ', 'frisdrank', 'cola', '^sap', 'jus d', 'sinaasappelsap', 'appelsap', '^bier', 'wijn',
      'limonade', 'siroop', 'ice tea', 'tonic', 'gembersiroop',
    ],
  },
  {
    key: 'diepvries',
    label: 'Diepvries',
    icon: 'snow-outline',
    words: [
      'diepvries', '^ijs', 'ijsblokjes', 'friet', 'patat', 'ovenfriet', 'kroket', 'frikandel', 'pizza',
      'bladerdeeg', 'vissticks', 'bitterballen', 'loempia', 'gyoza', 'dumplings', 'a la creme', 'sojabonen', 'edamame',
    ],
  },
  {
    key: 'huishouden',
    label: 'Drogisterij & huishouden',
    icon: 'sparkles-outline',
    words: [
      'wc-papier', 'toiletpapier', 'keukenpapier', 'afwasmiddel', 'wasmiddel', 'vaatwas', 'tandpasta', 'shampoo',
      'douchegel', 'zeep', 'vuilniszak', 'aluminiumfolie', 'folie', 'luiers', 'deodorant', 'tandenborstel',
      'schoonmaak', 'sponsjes', 'batterij',
    ],
  },
  { key: 'overig', label: 'Overig', icon: 'ellipsis-horizontal-circle-outline', words: [] },
];

const BY_KEY = new Map(AISLES.map((a) => [a.key, a]));

export function aisle(key: AisleKey): Aisle {
  return BY_KEY.get(key) ?? BY_KEY.get('overig')!;
}

// Brands whose products are all in one aisle, whatever else the name says.
const BRANDS: [string, AisleKey][] = [
  ['chicken tonight', 'conserven'],
  ['honig', 'conserven'],
  ['knorr', 'conserven'],
  ['maggi', 'conserven'],
  ['conimex', 'wereld'],
  ['old el paso', 'wereld'],
  ['santa maria', 'wereld'],
];

/** Lower case without accents, so "Maïzena" and "crème fraîche" match too. */
function plain(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

type Match = { key: AisleKey; start: number; end: number };

const WORDS = AISLES.flatMap((a) =>
  a.words.map((word) => {
    const atStart = word.startsWith('^');
    const w = plain(atStart ? word.slice(1) : word);
    return { key: a.key, w, atStart };
  }),
);

function matches(text: string): Match[] {
  const found: Match[] = [];
  for (const { key, w, atStart } of WORDS) {
    for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1)) {
      if (!atStart || /[\s'-]/.test(text[i - 1])) found.push({ key, start: i, end: i + w.length });
    }
  }
  // Only words that aren't part of a longer match; of those the last, then the longest.
  const own = found.filter(
    (m) => !found.some((o) => o !== m && o.start <= m.start && m.end <= o.end && o.end - o.start > m.end - m.start),
  );
  return own.sort((a, b) => b.end - a.end || b.end - b.start - (a.end - a.start));
}

/** Where a product most likely is, from the words in its name. */
export function guessAisle(name: string): AisleKey {
  const full = ` ${plain(name)} `;
  const brand = BRANDS.find(([b]) => full.includes(b));
  if (brand) return brand[1];
  // "champignons, gehalveerd" and "eieren (optioneel)": the product is what comes first.
  const main = ` ${full.replace(/\([^)]*\)?/g, ' ').split(/[,:]/)[0]} `;
  return (matches(main)[0] ?? matches(full)[0])?.key ?? 'overig';
}

/** The family's choice for this product, or else the guess. */
export function aisleOf(name: string, overrides: Record<string, string>): AisleKey {
  const chosen = overrides[name.trim().toLowerCase()];
  return chosen && BY_KEY.has(chosen as AisleKey) ? (chosen as AisleKey) : guessAisle(name);
}
