// Runs one scenario against the Firebase api (on the emulators, with the real rules) and the demo
// api, and compares the outcome after every step. The demo api is the reference: it was written to
// match the Supabase version exactly. Needs the emulators running (npm run emulators).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(here, '../node_modules/.same-behaviour');
mkdirSync(out, { recursive: true });

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => void storage.set(k, v),
  removeItem: (k) => void storage.delete(k),
};
process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'fake';
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'demo-weekmenu';
process.env.EXPO_PUBLIC_FIREBASE_APP_ID = 'x';
process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1';

const entry = resolve(out, 'entry.ts');
const { writeFileSync } = await import('node:fs');
writeFileSync(
  entry,
  `export * as firebaseApi from ${JSON.stringify(resolve(root, 'src/lib/api.firebase.ts'))};
   export * as demoApi from ${JSON.stringify(resolve(root, 'src/lib/api.demo.ts'))};
   export * as family from ${JSON.stringify(resolve(root, 'src/lib/family.ts'))};
   export { auth, setCurrentHousehold } from ${JSON.stringify(resolve(root, 'src/lib/firebase.ts'))};
   export { createUserWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: resolve(out, 'bundle.mjs'),
  nodePaths: [resolve(root, 'node_modules')],
  external: ['firebase/*', '@firebase/*'],
  alias: {
    'expo-image-picker': resolve(here, 'stubs/empty.mjs'),
    'expo-sqlite/localStorage/install': resolve(here, 'stubs/empty.mjs'),
    'react-native': resolve(here, 'stubs/empty.mjs'),
  },
  logLevel: 'error',
});
// The bundle's firebase has to come from the app itself: that's the version that ships.
writeFileSync(resolve(out, 'package.json'), '{"type":"module"}');
const { symlinkSync, existsSync } = await import('node:fs');
if (!existsSync(resolve(out, 'node_modules'))) symlinkSync(resolve(root, 'node_modules'), resolve(out, 'node_modules'), 'junction');
const { firebaseApi, demoApi, family, auth, setCurrentHousehold, createUserWithEmailAndPassword } = await import(
  pathToFileURL(resolve(out, 'bundle.mjs'))
);

const WEEK = '2030-01-07'; // A Monday, far from anything in the demo's example data.
const LATER = '2030-01-14';

async function scenario(api, ctx) {
  const log = [];
  const names = new Map();
  const nameOf = (id) => names.get(id) ?? id;
  const clean = (ingredients) =>
    ingredients?.map((i) => ({ name: i.name, quantity: i.quantity ?? null, unit: i.unit ?? null })) ?? null;

  async function weekState(week) {
    const { plan, meals, chooserOverrides } = await api.getWeekPlan(week);
    if (!plan) return null;
    const [checks, extras] = await Promise.all([api.listShoppingChecks(plan.id), api.listShoppingExtras(plan.id)]);
    return {
      week: plan.week_start,
      ready: plan.ready_at ?? null,
      skipped: [...(plan.staples_skipped ?? [])].sort(),
      meals: meals.map((m) => ({
        day: m.day,
        own: m.recipe_id == null,
        recipe: m.recipe.title,
        title: m.title ?? null,
        servings: m.servings,
        note: m.note ?? null,
        custom: clean(m.custom_ingredients),
        ingredients: clean(m.recipe.recipe_ingredients),
      })),
      choosers: chooserOverrides.map((c) => (c === undefined ? 'rotation' : c === null ? 'nobody' : nameOf(c))),
      checks: [...checks].map((k) => k.replace(/^extra:.*/, 'extra:*')).sort(),
      extras: extras.map((e) => ({ name: e.name, quantity: e.quantity ?? null, staple: e.staple_id ?? null })),
    };
  }
  const WEEKS = ['2029-12-31', '2030-01-02', WEEK, '2030-01-09', LATER, '2030-01-16'];
  async function step(name, action) {
    let result;
    try {
      result = await action();
    } catch (e) {
      log.push({ step: name, error: e.message });
      throw new Error(`${ctx.name}: step "${name}" failed: ${e.message}`);
    }
    const weeks = {};
    for (const w of WEEKS) weeks[w] = await weekState(w);
    log.push({ step: name, weeks });
    return result;
  }
  const { householdId, userId, otherUser } = ctx;
  const c = { householdId, userId };
  names.set(userId, 'me');
  names.set(otherUser, 'other');
  const input = (title, tags, ingredients) => ({
    title,
    description: null,
    image_url: null,
    servings: 4,
    prep_minutes: 20,
    instructions: 'Koken',
    source_url: null,
    tags,
    ingredients,
  });
  const pasta = await step('recept maken', () =>
    api.saveRecipe(input('Pasta', ['snel', 'oud'], [
      { name: 'pasta', quantity: 400, unit: 'g' },
      { name: 'saus', quantity: null, unit: null },
      { name: '  ', quantity: 1, unit: null },
    ]), c),
  );
  const soep = await step('tweede recept', () => api.saveRecipe(input('Soep', ['oud'], [{ name: 'ui', quantity: 2, unit: null }]), c));
  await step('recept wijzigen', () => api.saveRecipe(input('Pasta pesto', ['snel', 'oud'], [
    { name: 'pasta', quantity: 500, unit: 'g' },
    { name: 'pesto', quantity: 1, unit: 'pot' },
  ]), c, pasta));
  const got = await api.getRecipe(pasta);
  log.push({ step: 'recept lezen', recipe: { title: got.title, tags: got.tags, ingredients: clean(got.recipe_ingredients), servings: got.servings } });

  await step('gerecht toevoegen', () => api.addMeal(householdId, WEEK, 0, pasta, 4));
  await step('tweede op andere dag', () => api.addMeal(householdId, WEEK, 2, soep, 2));
  await step('AVG toevoegen', () => api.addOwnDish(householdId, WEEK, 2, 'AVG', [{ name: 'aardappels', quantity: 250, unit: 'g' }], 3));
  await step('op late dag', () => api.addMeal(householdId, WEEK, 5, soep, 5));
  const firstPlan = async () => (await api.getWeekPlan(WEEK)).plan;
  const meals = async () => (await api.getWeekPlan(WEEK)).meals;
  const planId = (await firstPlan()).id;
  await step('dagen wisselen', () => api.swapDays(planId, 0, 2));
  const pastaMeal = (await meals()).find((m) => m.recipe_id === pasta);
  const soepMeal = (await meals()).find((m) => m.recipe_id === soep && m.day === 0);
  const avg = (await meals()).find((m) => m.recipe_id == null);
  await step('personen wijzigen', () => api.updateMealServings(pastaMeal.id, 6));
  await step('aanpassen voor een avond', () =>
    api.updateMealAdjustments(pastaMeal.id, { note: 'met kip', custom_ingredients: [{ name: 'kip', quantity: 300, unit: 'g' }] }),
  );
  await step('terug naar recept', () => api.updateMealAdjustments(pastaMeal.id, { note: null, custom_ingredients: null }));
  await step('gerecht vervangen', () => api.replaceMeal(soepMeal.id, pasta, 3));
  await step('AVG wijzigen', () => api.updateOwnDish(avg.id, 'AVG 2', [{ name: 'rijst', quantity: 100, unit: 'g' }], 2));
  await step('kiezers instellen', () => api.setDayChoosers(householdId, WEEK, [0, 1], otherUser));
  await step('niemand kiest', () => api.setDayChoosers(householdId, WEEK, [3], null));
  await step('kiezer terug', () => api.resetDayChoosers(WEEK, [1]));
  await step('nog een extra', () => api.addShoppingExtra(householdId, WEEK, userId, 'melk'));
  await step('extra van vaste lijst', () => api.addShoppingExtra(householdId, WEEK, userId, 'thee', 's1'));
  const extras = await api.listShoppingExtras(planId);
  await step('aantal extra', () => api.setShoppingExtraQuantity(extras[0], 3));
  await step('vinkje', () => api.setShoppingCheck(planId, 'pasta|g', true));
  await step('tweede vinkje', () => api.setShoppingCheck(planId, 'aantal:1:pesto|pot', true));
  await step('vinkje op extra', () => api.setShoppingCheck(planId, `extra:${extras[1].id}`, true));
  await step('vinkje met schuine streep', () => api.setShoppingCheck(planId, 'a/b|g', true));
  await step('vinkje uit', () => api.setShoppingCheck(planId, 'pasta|g', false));
  await step('vaste boodschap overslaan', () => api.setStapleSkipped(householdId, WEEK, 's2', true));
  await step('tweede overslaan', () => api.setStapleSkipped(householdId, WEEK, 's3', true));
  await step('overslaan terug', () => api.setStapleSkipped(householdId, WEEK, 's2', false));
  await step('ook in volgende week', () => api.addMeal(householdId, LATER, 1, pasta, 4));
  await step('extra weg', () => api.removeShoppingExtra(extras[1]));

  await step('boodschappendag naar woensdag', () => api.setShoppingDay(householdId, 2));
  await step('boodschappendag naar maandag', () => api.setShoppingDay(householdId, 0));

  await api.setFavorite(userId, soep, true);
  await api.setFavorite(userId, pasta, true);
  await api.setFavorite(userId, pasta, false);
  log.push({ step: 'favorieten', has: { soep: (await api.listFavoriteIds(userId)).has(soep), pasta: (await api.listFavoriteIds(userId)).has(pasta) } });

  await api.replaceTagsEverywhere(['oud'], 'nieuw');
  log.push({ step: 'labels vervangen', tags: (await api.getRecipe(soep)).tags, other: (await api.getRecipe(pasta)).tags });
  await api.replaceTagsEverywhere(['nieuw'], null);
  log.push({ step: 'labels weg', tags: (await api.getRecipe(soep)).tags });

  await step('recept verwijderen haalt gerechten mee', () => api.deleteRecipe(soep));
  log.push({
    step: 'na verwijderen',
    favorite: (await api.listFavoriteIds(userId)).has(soep),
    inList: (await api.listRecipes()).some((r) => r.id === soep),
  });
  const avgs = await api.listAvgDishes();
  log.push({ step: 'AVG-lijst', rijst: avgs.some((list) => list.some((i) => i.name === 'rijst')) });
  await step('gerecht weg', () => api.removeMeal(pastaMeal.id));
  return log;
}

const email = `test${Date.now()}@example.test`;
const { user } = await createUserWithEmailAndPassword(auth, email, 'test-password');
await family.ensureProfile(user.uid, 'Test', email);
await family.createHousehold('Testgezin');
const profile = await family.ensureProfile(user.uid, 'Test', email);
setCurrentHousehold(profile.household_id);

const demoSession = demoApi.getDemoSession();
const [firebaseLog, demoLog] = [
  await scenario(firebaseApi, { name: 'firebase', householdId: profile.household_id, userId: user.uid, otherUser: 'someone-else' }),
  await scenario(demoApi, { name: 'demo', householdId: demoSession.household.id, userId: demoSession.profile.id, otherUser: 'someone-else' }),
];

let differences = 0;
firebaseLog.forEach((entry, i) => {
  const a = JSON.stringify(entry);
  const b = JSON.stringify(demoLog[i]);
  if (a !== b) {
    differences += 1;
    console.log(`\nVERSCHIL bij "${entry.step}"`);
    if (entry.weeks && demoLog[i]?.weeks) {
      for (const w of Object.keys(entry.weeks)) {
        const x = JSON.stringify(entry.weeks[w]);
        const y = JSON.stringify(demoLog[i].weeks[w]);
        if (x !== y) console.log(`  week ${w}\n    firebase: ${x}\n    demo:     ${y}`);
      }
    } else {
      console.log(`  firebase: ${a}\n  demo:     ${b}`);
    }
  }
});
// npm test -- "stapnaam" shows what a step came to, to see for yourself.
const shown = firebaseLog.find((entry) => entry.step === process.argv[2]);
if (shown) console.log(JSON.stringify(shown, null, 1));
console.log(`\n${firebaseLog.length} stappen vergeleken, ${differences} verschillen`);
process.exit(differences ? 1 : 0);
