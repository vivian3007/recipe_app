// The security rules: nobody gets at another family's data, and all the app does is allowed.
// Needs the emulators running (npm run emulators).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-weekmenu',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'profiles/anna'), { display_name: 'Anna', household_id: 'h1' });
    await setDoc(doc(db, 'profiles/bert'), { display_name: 'Bert', household_id: 'h1' });
    await setDoc(doc(db, 'profiles/eve'), { display_name: 'Eve', household_id: 'h2' });
    await setDoc(doc(db, 'profiles/nieuw'), { display_name: 'Nieuw', household_id: null });
    await setDoc(doc(db, 'households/h1'), { name: 'Een', invite_code: 'AAAAAA', shopping_day: 0 });
    await setDoc(doc(db, 'households/h2'), { name: 'Twee', invite_code: 'BBBBBB', shopping_day: 0 });
    await setDoc(doc(db, 'inviteCodes/AAAAAA'), { household_id: 'h1' });
    await setDoc(doc(db, 'households/h1/recipes/r1'), { title: 'Van Anna', created_by: 'anna', tags: [] });
    await setDoc(doc(db, 'households/h1/recipes/r2'), { title: 'Van Bert', created_by: 'bert', tags: [] });
    await setDoc(doc(db, 'households/h1/weekPlans/2030-01-07'), { household_id: 'h1', week_start: '2030-01-07', checks: [] });
    await setDoc(doc(db, 'households/h1/meals/m1'), { week_plan_id: '2030-01-07', day: 0, recipe_id: 'r1' });
    await setDoc(doc(db, 'households/h1/choosers/2030-01-07_0'), { week_plan_id: '2030-01-07', day: 0, chooser_id: 'anna' });
    await setDoc(doc(db, 'households/h1/shoppingExtras/e1'), { week_plan_id: '2030-01-07', name: 'melk' });
    await setDoc(doc(db, 'households/h1/favorites/anna_r1'), { user_id: 'anna', recipe_id: 'r1' });
    await setDoc(doc(db, 'households/h1/favorites/bert_r1'), { user_id: 'bert', recipe_id: 'r1' });
    await setDoc(doc(db, 'households/h1/remindersSent/x'), { sent_on: '2030-01-05' });
    await setDoc(doc(db, 'pushTokens/t-anna'), { token: 't-anna', user_id: 'anna', kind: 'expo' });
    await setDoc(doc(db, 'pushTokens/t-bert'), { token: 't-bert', user_id: 'bert', kind: 'expo' });
  });
});

const FAMILY_PATHS = [
  'households/h1',
  'households/h1/recipes/r1',
  'households/h1/weekPlans/2030-01-07',
  'households/h1/meals/m1',
  'households/h1/choosers/2030-01-07_0',
  'households/h1/shoppingExtras/e1',
];

test('family members read everything of their family', async () => {
  for (const path of FAMILY_PATHS) await assertSucceeds(getDoc(doc(as('bert'), path)));
  await assertSucceeds(getDocs(collection(as('bert'), 'households/h1/recipes')));
  await assertSucceeds(getDocs(query(collection(as('bert'), 'profiles'), where('household_id', '==', 'h1'))));
});

test("another family and strangers read nothing", async () => {
  for (const path of FAMILY_PATHS) {
    await assertFails(getDoc(doc(as('eve'), path)));
    await assertFails(getDoc(doc(as('nieuw'), path)));
    await assertFails(getDoc(doc(anon(), path)));
  }
  await assertFails(getDocs(collection(as('eve'), 'households/h1/recipes')));
  await assertFails(getDoc(doc(as('eve'), 'profiles/anna')));
  await assertFails(getDocs(query(collection(as('eve'), 'profiles'), where('household_id', '==', 'h1'))));
  await assertFails(getDocs(collection(as('eve'), 'profiles')));
  await assertFails(getDocs(collection(as('eve'), 'households')));
});

test('another family writes nothing', async () => {
  const eve = as('eve');
  await assertFails(updateDoc(doc(eve, 'households/h1'), { name: 'Gehackt' }));
  await assertFails(setDoc(doc(eve, 'households/h1/recipes/x'), { title: 'x', created_by: 'eve' }));
  await assertFails(deleteDoc(doc(eve, 'households/h1/recipes/r1')));
  await assertFails(updateDoc(doc(eve, 'households/h1/weekPlans/2030-01-07'), { checks: ['x'] }));
  await assertFails(deleteDoc(doc(eve, 'households/h1/meals/m1')));
  await assertFails(deleteDoc(doc(eve, 'households/h1/favorites/anna_r1')));
});

test('family members do what the app needs', async () => {
  const bert = as('bert');
  await assertSucceeds(updateDoc(doc(bert, 'households/h1'), { staples: [] }));
  await assertSucceeds(setDoc(doc(bert, 'households/h1/recipes/n'), { title: 'Nieuw', created_by: 'bert' }));
  await assertSucceeds(updateDoc(doc(bert, 'households/h1/recipes/r1'), { title: 'Aangepast' }));
  await assertSucceeds(updateDoc(doc(bert, 'households/h1/weekPlans/2030-01-07'), { checks: ['a'] }));
  await assertSucceeds(setDoc(doc(bert, 'households/h1/meals/n'), { week_plan_id: '2030-01-07', day: 1 }));
  await assertSucceeds(deleteDoc(doc(bert, 'households/h1/meals/m1')));
  await assertSucceeds(deleteDoc(doc(bert, 'households/h1/choosers/2030-01-07_0')));
  await assertSucceeds(updateDoc(doc(bert, 'households/h1/shoppingExtras/e1'), { quantity: 2 }));
});

test('only your own recipes can be deleted, and nobody else can pose as the author', async () => {
  const bert = as('bert');
  await assertFails(deleteDoc(doc(bert, 'households/h1/recipes/r1')));
  await assertSucceeds(deleteDoc(doc(bert, 'households/h1/recipes/r2')));
  await assertFails(setDoc(doc(bert, 'households/h1/recipes/n'), { title: 'x', created_by: 'anna' }));
});

test('favorites are your own, but go when a recipe goes', async () => {
  const bert = as('bert');
  await assertSucceeds(getDocs(query(collection(bert, 'households/h1/favorites'), where('user_id', '==', 'bert'))));
  await assertFails(getDocs(query(collection(bert, 'households/h1/favorites'), where('user_id', '==', 'anna'))));
  await assertFails(getDoc(doc(bert, 'households/h1/favorites/anna_r1')));
  await assertFails(setDoc(doc(bert, 'households/h1/favorites/anna_r2'), { user_id: 'anna', recipe_id: 'r2' }));
  await assertSucceeds(setDoc(doc(bert, 'households/h1/favorites/bert_r2'), { user_id: 'bert', recipe_id: 'r2' }));
  await assertSucceeds(deleteDoc(doc(bert, 'households/h1/favorites/anna_r1')));
});

test('reminders are only for the worker', async () => {
  await assertFails(getDoc(doc(as('anna'), 'households/h1/remindersSent/x')));
  await assertFails(setDoc(doc(as('anna'), 'households/h1/remindersSent/y'), { sent_on: 'x' }));
});

test('push addresses are your own', async () => {
  const anna = as('anna');
  await assertSucceeds(getDoc(doc(anna, 'pushTokens/t-anna')));
  await assertFails(getDoc(doc(anna, 'pushTokens/t-bert')));
  await assertFails(deleteDoc(doc(anna, 'pushTokens/t-bert')));
  await assertFails(updateDoc(doc(anna, 'pushTokens/t-bert'), { user_id: 'anna' }));
  await assertFails(setDoc(doc(anna, 'pushTokens/new'), { token: 'new', user_id: 'bert', kind: 'expo' }));
  await assertSucceeds(setDoc(doc(anna, 'pushTokens/new'), { token: 'new', user_id: 'anna', kind: 'expo' }));
  await assertSucceeds(deleteDoc(doc(anna, 'pushTokens/t-anna')));
});

test('profiles: your own only, and no way into a family without its code', async () => {
  const eve = as('eve');
  await assertFails(updateDoc(doc(eve, 'profiles/anna'), { display_name: 'Hack' }));
  await assertSucceeds(updateDoc(doc(eve, 'profiles/eve'), { display_name: 'Eva' }));
  await assertFails(updateDoc(doc(eve, 'profiles/eve'), { household_id: 'h1' }));
  await assertFails(updateDoc(doc(eve, 'profiles/eve'), { household_id: 'h1', joined_with: 'FOUTJE' }));
  await assertFails(updateDoc(doc(eve, 'profiles/eve'), { household_id: 'h1', joined_with: 'BBBBBB' }));
  await assertFails(setDoc(doc(as('los'), 'profiles/los'), { display_name: 'Los', household_id: 'h1' }));
  await assertSucceeds(setDoc(doc(as('los'), 'profiles/los'), { display_name: 'Los', household_id: null }));
  await assertFails(setDoc(doc(as('los'), 'profiles/anna'), { display_name: 'Los', household_id: null }));
});

test('joining with the right code works', async () => {
  const nieuw = as('nieuw');
  await assertSucceeds(getDoc(doc(nieuw, 'inviteCodes/AAAAAA')));
  await assertSucceeds(updateDoc(doc(nieuw, 'profiles/nieuw'), { household_id: 'h1', joined_with: 'AAAAAA' }));
  await assertSucceeds(getDoc(doc(nieuw, 'households/h1')));
});

test('codes can be asked for, not listed; a family and its code are made together', async () => {
  const nieuw = as('nieuw');
  await assertFails(getDocs(collection(nieuw, 'inviteCodes')));
  await assertFails(getDoc(doc(anon(), 'inviteCodes/AAAAAA')));
  await assertFails(setDoc(doc(nieuw, 'inviteCodes/ZZZZZZ'), { household_id: 'h1' }));

  const batch = writeBatch(nieuw);
  batch.set(doc(nieuw, 'households/nieuw-gezin'), { name: 'Nieuw', invite_code: 'CCCCCC', created_by: 'nieuw' });
  batch.set(doc(nieuw, 'inviteCodes/CCCCCC'), { household_id: 'nieuw-gezin' });
  batch.update(doc(nieuw, 'profiles/nieuw'), { household_id: 'nieuw-gezin' });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(nieuw, 'households/nieuw-gezin')));
});

test("a family's code can't be changed, and families can't be deleted", async () => {
  await assertFails(updateDoc(doc(as('anna'), 'households/h1'), { invite_code: 'XXXXXX' }));
  await assertFails(deleteDoc(doc(as('anna'), 'households/h1')));
});
