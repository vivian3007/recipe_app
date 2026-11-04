// The migration with example rows on the emulators (firebase/: npm run emulators, and once
// `node tests/same-behaviour.mjs`, which builds the app's api). The app itself then reads the result,
// logged in and under the real security rules. Only reading Supabase itself isn't tested here.
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'fake';
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'demo-weekmenu';
process.env.EXPO_PUBLIC_FIREBASE_APP_ID = 'x';
process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1';
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => void storage.set(k, v),
  removeItem: (k) => void storage.delete(k),
};

const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
const { check, importUsers, writeDocuments } = await import('./migrate.mjs');
const { danglingReferences, toDocuments } = await import('./transform.mjs');

const pass = (name) => console.log(`ok  ${name}`);
const app = initializeApp({ projectId: 'demo-weekmenu' });
const db = getFirestore(app);
const auth = getAuth(app);

const ANNA = '11111111-1111-4111-8111-111111111111';
const BERT = '22222222-2222-4222-8222-222222222222';
const EVE = '33333333-3333-4333-8333-333333333333';
const GONE = '99999999-9999-4999-8999-999999999999';
const H1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const H2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const R1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
const R2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02';
const R3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc03';
const P1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
const P2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
const P3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd03';
const OLD_PHOTO = 'https://x.supabase.co/storage/v1/object/public/recipe-images/h/a.jpg';
const NEW_PHOTO = 'https://res.cloudinary.com/test/image/upload/recipe-images/h/a.jpg';
const SITE_PHOTO = 'https://www.ah.nl/plaatje.jpg';
const WEB_TOKEN = 'https://fcm.googleapis.com/fcm/send/abc:def/ghi';

const household = (id, code, over = {}) => ({
  id,
  name: `Gezin ${code}`,
  invite_code: code,
  shopping_day: 0,
  chooser_rotation: [],
  rotation_start: null,
  avg_options: [],
  aisle_overrides: {},
  aisle_setup: {},
  staples: [],
  remind_days_before: 2,
  remind_hour: 9,
  shopper_ids: [],
  created_at: '2026-01-01T10:00:00.000Z',
  ...over,
});
const recipe = (id, h, by, title, over = {}) => ({
  id,
  household_id: h,
  created_by: by,
  title,
  description: null,
  image_url: null,
  servings: 4,
  prep_minutes: null,
  instructions: null,
  source_url: null,
  tags: [],
  created_at: '2026-02-01T10:00:00.000Z',
  ...over,
});

const tables = {
  households: [
    household(H1, 'AAAAAA', {
      shopping_day: 2,
      chooser_rotation: [ANNA, BERT, GONE],
      rotation_start: '2026-11-04',
      shopper_ids: [BERT],
      avg_options: [{ group: 'a', label: 'Friet', name: 'friet', quantity: 1.5, unit: null, hidden: false }],
      aisle_overrides: { 'kokos melk': 'wereld' },
      aisle_setup: { order: ['groente'], names: { groente: 'AGF' }, extra: [{ key: 'x', label: 'X' }] },
      staples: [{ id: 's1', name: 'Thee', askKind: true }],
    }),
    household(H2, 'BBBBBB'),
  ],
  profiles: [
    { id: ANNA, display_name: 'Anna', household_id: H1, created_at: '2026-01-01T10:00:00.000Z' },
    { id: BERT, display_name: 'Bert', household_id: H1, created_at: '2026-01-01T10:00:00.000Z' },
    { id: EVE, display_name: 'Eve', household_id: H2, created_at: '2026-01-01T10:00:00.000Z' },
  ],
  recipes: [
    recipe(R1, H1, ANNA, 'Lasagne', { image_url: OLD_PHOTO, tags: ['oven', 'pasta'], prep_minutes: 45, instructions: 'Regel 1\nRegel 2 €ü' }),
    recipe(R2, H1, null, 'Zonder maker', { image_url: SITE_PHOTO, created_at: '2026-03-01T10:00:00.000Z' }),
    recipe(R3, H2, EVE, 'Van een ander gezin'),
  ],
  recipe_ingredients: [
    { id: 'i2', recipe_id: R1, name: 'kaas', quantity: 0.25, unit: 'kg', position: 1 },
    { id: 'i1', recipe_id: R1, name: 'gehakt', quantity: 500, unit: 'g', position: 0 },
    { id: 'i3', recipe_id: R1, name: 'zout', quantity: null, unit: null, position: 2 },
  ],
  favorites: [{ user_id: ANNA, recipe_id: R1, created_at: '2026-02-02T10:00:00.000Z' }, { user_id: BERT, recipe_id: R1, created_at: '2026-02-02T10:00:00.000Z' }],
  week_plans: [
    { id: P1, household_id: H1, week_start: '2026-11-04', staples_skipped: ['s1'], ready_at: '2026-11-03T18:00:00.000Z', ready_by: ANNA },
    { id: P2, household_id: H1, week_start: '2026-11-11', staples_skipped: [], ready_at: null, ready_by: null },
    { id: P3, household_id: H2, week_start: '2026-11-04', staples_skipped: [], ready_at: null, ready_by: null },
  ],
  week_plan_meals: [
    { id: 'm2', week_plan_id: P1, day: 2, recipe_id: null, title: 'AVG', servings: 3, note: null, custom_ingredients: [{ name: 'friet', quantity: 1.5, unit: null }], created_at: '2026-11-01T10:00:00.000Z' },
    { id: 'm1', week_plan_id: P1, day: 0, recipe_id: R1, title: null, servings: 6, note: 'met kip', custom_ingredients: [{ name: 'kip', quantity: 300, unit: 'g' }], created_at: '2026-11-01T09:00:00.000Z' },
    { id: 'm3', week_plan_id: P3, day: 1, recipe_id: R3, title: null, servings: 2, note: null, custom_ingredients: null, created_at: '2026-11-01T09:00:00.000Z' },
  ],
  week_plan_choosers: [
    { week_plan_id: P1, day: 1, chooser_id: BERT },
    { week_plan_id: P1, day: 4, chooser_id: null },
  ],
  shopping_checks: [
    { week_plan_id: P1, item_key: 'gehakt|g' },
    { week_plan_id: P1, item_key: 'aantal:1:mozzarella|' },
    { week_plan_id: P1, item_key: 'weg:zak/doos|' },
    { week_plan_id: P1, item_key: 'extra:e1' },
  ],
  shopping_extras: [
    { id: 'e2', week_plan_id: P1, name: 'koffie', staple_id: 's1', quantity: 2, created_by: BERT, created_at: '2026-11-02T10:00:00.000Z' },
    { id: 'e1', week_plan_id: P1, name: 'melk', staple_id: null, quantity: null, created_by: ANNA, created_at: '2026-11-01T10:00:00.000Z' },
  ],
  push_tokens: [
    { token: 'ExponentPushToken[abc]', user_id: ANNA, kind: 'expo', subscription: null, created_at: '2026-01-01T10:00:00.000Z' },
    { token: WEB_TOKEN, user_id: BERT, kind: 'web', subscription: { endpoint: WEB_TOKEN, keys: { p256dh: 'p', auth: 'a' } }, created_at: '2026-01-01T10:00:00.000Z' },
  ],
  reminders_sent: [{ household_id: H1, week_start: '2026-11-04', sent_on: '2026-11-02' }],
};
const users = [
  { id: ANNA, email: 'anna@example.test', encrypted_password: '$2a$10$abcdefghijklmnopqrstuuMWOVxLNXdZxVgpGYGqxPbBpAqMqfTWy', email_confirmed_at: '2026-01-01', raw_user_meta_data: { display_name: 'Anna' }, created_at: '2026-01-01T10:00:00Z', last_sign_in_at: null },
  { id: BERT, email: 'bert@example.test', encrypted_password: '$2a$10$abcdefghijklmnopqrstuuMWOVxLNXdZxVgpGYGqxPbBpAqMqfTWy', email_confirmed_at: null, raw_user_meta_data: {}, created_at: '2026-01-01T10:00:00Z', last_sign_in_at: '2026-10-01T10:00:00Z' },
  { id: EVE, email: 'eve@example.test', encrypted_password: null, email_confirmed_at: '2026-01-01', raw_user_meta_data: {}, created_at: '2026-01-01T10:00:00Z', last_sign_in_at: null },
];
const photoMap = { [OLD_PHOTO]: NEW_PHOTO };

// ---------- A clean start ----------
const emulator = 'http://127.0.0.1:8080/emulator/v1/projects/demo-weekmenu/databases/(default)/documents';
await fetch(emulator, { method: 'DELETE' });
await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-weekmenu/accounts', { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });

// ---------- Moving ----------
const references = danglingReferences(tables);
assert.deepEqual(references.problems, []);
assert.equal(references.warnings.length, 1, 'someone who left is mentioned, not a failure');
assert.match(references.warnings[0], new RegExp(GONE));
pass('references: a member who left is a warning');

const { docs, problems, expectedCounts } = toDocuments(tables, photoMap);
assert.deepEqual(problems, []);
assert.deepEqual(await importUsers(auth, users), []);
assert.deepEqual(await writeDocuments(db, docs), []);
let report = await check(db, auth, { docs, expectedCounts, tables, users });
assert.deepEqual(report.problems, []);
report.lines.forEach((line) => console.log(line));
pass('all rows arrived, all counts match');

const anna = await auth.getUser(ANNA);
assert.equal(anna.email, 'anna@example.test');
assert.equal(anna.emailVerified, true);
assert.equal((await auth.getUser(BERT)).emailVerified, false);
pass('accounts keep their id, e-mail address and confirmation');

// Again: nothing doubles and nothing changes.
assert.deepEqual(await importUsers(auth, users), []);
assert.deepEqual(await writeDocuments(db, docs), []);
report = await check(db, auth, { docs, expectedCounts, tables, users });
assert.deepEqual(report.problems, []);
pass('running it twice changes nothing');

// ---------- Does the check catch it when something's wrong? ----------
await db.doc(`households/${H1}/recipes/${R1}`).update({ title: 'Anders' });
await db.doc(`households/${H1}/meals/m1`).delete();
await db.doc(`households/${H1}/meals/onbekend`).set({ week_plan_id: 'x' });
await db.doc(`households/${H1}/weekPlans/2026-11-04`).update({ checks: ['gehakt|g'] });
await auth.deleteUser(BERT);
report = await check(db, auth, { docs, expectedCounts, tables, users });
const said = report.problems.join('\n');
assert.match(said, /title: was "Lasagne", is "Anders"/);
assert.match(said, /Ontbreekt: .*meals\/m1/);
assert.match(said, /checks/);
assert.match(said, /Account ontbreekt: bert/);
const mealCount = report.problems.find((p) => p.startsWith('Aantal meals'));
assert.equal(mealCount, undefined, 'one gone and one extra: the count alone would miss this, which is why each document is compared');
pass('the check notices changed, missing and lost data');

await db.doc(`households/${H1}/meals/onbekend`).delete();
report = await check(db, auth, { docs, expectedCounts, tables, users });
assert.ok(report.problems.some((p) => p.startsWith('Aantal meals')));
pass('the check notices a wrong count');

const broken = structuredClone(tables);
broken.week_plan_meals.push({ id: 'm9', week_plan_id: 'bestaat-niet', day: 0, recipe_id: null, title: 'x', servings: 1, note: null, custom_ingredients: [], created_at: 'x' });
assert.ok(toDocuments(broken, photoMap).problems.some((p) => p.includes('bestaat-niet')));
assert.ok(danglingReferences(broken).problems.some((p) => p.includes('m9')));
pass('a row that points at nothing is reported, not skipped');

// Back to how it should be.
assert.deepEqual(await importUsers(auth, users), []);
assert.deepEqual(await writeDocuments(db, docs), []);
assert.deepEqual((await check(db, auth, { docs, expectedCounts, tables, users })).problems, []);

// ---------- The app reads it, logged in, under the real rules ----------
const bundle = resolve(process.cwd(), 'firebase/node_modules/.same-behaviour/bundle.mjs');
const { firebaseApi: api, family, auth: appAuth, setCurrentHousehold, signInWithCustomToken } = await import(pathToFileURL(bundle));
await signInWithCustomToken(appAuth, await auth.createCustomToken(ANNA));
const profile = await family.ensureProfile(ANNA, null, null);
assert.deepEqual([profile.display_name, profile.household_id], ['Anna', H1]);
const h = await family.getHousehold(H1);
assert.deepEqual(h.chooser_rotation, [ANNA, BERT, GONE]);
assert.equal(h.avg_options[0].quantity, 1.5);
assert.equal(h.aisle_setup.names.groente, 'AGF');
assert.equal(h.staples[0].askKind, true);
assert.deepEqual((await family.membersOf(H1)).map((m) => m.display_name), ['Anna', 'Bert']);
setCurrentHousehold(H1);
pass('login, profile, family and members');

const recipes = await api.listRecipes();
assert.deepEqual(recipes.map((r) => r.title), ['Zonder maker', 'Lasagne'], 'newest first, and only your own family');
const lasagne = await api.getRecipe(R1);
assert.equal(lasagne.image_url, NEW_PHOTO, 'a photo from Supabase now points at Cloudinary');
assert.equal((await api.getRecipe(R2)).image_url, SITE_PHOTO, "someone else's photo stays where it is");
assert.equal(lasagne.author.display_name, 'Anna');
assert.equal((await api.getRecipe(R2)).author, null);
assert.deepEqual(lasagne.recipe_ingredients.map((i) => [i.name, i.quantity, i.unit]), [['gehakt', 500, 'g'], ['kaas', 0.25, 'kg'], ['zout', null, null]]);
assert.equal(lasagne.instructions, 'Regel 1\nRegel 2 €ü');
assert.deepEqual(lasagne.tags, ['oven', 'pasta']);
assert.deepEqual([...(await api.listFavoriteIds(ANNA))], [R1]);
pass('recipes, photos, ingredients in order, favorites');

const week = await api.getWeekPlan('2026-11-04');
assert.equal(week.plan.id, '2026-11-04');
assert.equal(week.plan.ready_by, ANNA);
assert.deepEqual(week.plan.staples_skipped, ['s1']);
assert.deepEqual(week.meals.map((m) => [m.id, m.day, m.recipe.title]), [['m1', 0, 'Lasagne'], ['m2', 2, 'AVG']]);
assert.equal(week.meals[0].note, 'met kip');
assert.equal(week.meals[0].custom_ingredients[0].name, 'kip');
assert.equal(week.meals[1].recipe.recipe_ingredients[0].quantity, 1.5);
assert.deepEqual(week.chooserOverrides, [undefined, BERT, undefined, undefined, null, undefined, undefined], 'nobody chooses is not the same as following the rotation');
const checks = await api.listShoppingChecks('2026-11-04');
assert.deepEqual([...checks].sort(), ['aantal:1:mozzarella|', 'extra:e1', 'gehakt|g', 'weg:zak/doos|']);
assert.deepEqual((await api.listShoppingExtras('2026-11-04')).map((e) => [e.name, e.quantity]), [['melk', null], ['koffie', 2]]);
pass('week plan, dishes, choosers, ticks and products');

// ---------- A change that was still waiting on a phone, with the old plan id ----------
await api.setShoppingCheck(P1, 'nog-van-voor-de-verhuizing|', true);
assert.ok((await api.listShoppingChecks(P1)).has('nog-van-voor-de-verhuizing|'));
assert.ok((await api.listShoppingChecks('2026-11-04')).has('nog-van-voor-de-verhuizing|'));
const melk = (await api.listShoppingExtras(P1)).find((e) => e.name === 'melk');
await api.removeShoppingExtra({ ...melk, week_plan_id: P1 });
assert.ok(!(await api.listShoppingChecks('2026-11-04')).has('extra:e1'));
await assert.rejects(api.setShoppingCheck('00000000-dead-4bad-8bad-000000000000', 'x', true), /bestaat niet meer/);
pass('old plan ids from before the move still work');

// ---------- Another family stays out of it ----------
setCurrentHousehold(H2);
await assert.rejects(api.getRecipe(R3));
await assert.rejects(api.getWeekPlan('2026-11-04'));
pass("a migrated family can't get at another migrated family");

console.log('\nAlles geslaagd');
process.exit(0);
