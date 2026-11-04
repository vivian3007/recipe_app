// From the rows of the Supabase tables to Firestore documents. Nothing here touches a database, so
// the same function can say what should be there when checking afterwards.

export const TABLES = [
  'households',
  'profiles',
  'recipes',
  'recipe_ingredients',
  'favorites',
  'week_plans',
  'week_plan_meals',
  'week_plan_choosers',
  'shopping_checks',
  'shopping_extras',
  'push_tokens',
  'reminders_sent',
];

const without = (row, ...keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

/** @param photoUrls old public URL -> new one. */
export function toDocuments(tables, photoUrls = {}) {
  const docs = new Map();
  const problems = [];
  const put = (path, data) => {
    if (docs.has(path)) problems.push(`Twee rijen komen op dezelfde plek uit: ${path}`);
    docs.set(path, data);
  };

  for (const h of tables.households) {
    put(`households/${h.id}`, without(h, 'id'));
    put(`inviteCodes/${h.invite_code}`, { household_id: h.id });
  }
  for (const p of tables.profiles) put(`profiles/${p.id}`, without(p, 'id'));

  const ingredients = new Map();
  for (const i of tables.recipe_ingredients) {
    if (!ingredients.has(i.recipe_id)) ingredients.set(i.recipe_id, []);
    ingredients.get(i.recipe_id).push(without(i, 'recipe_id'));
  }
  const recipeOwner = new Map(tables.recipes.map((r) => [r.id, r.household_id]));
  for (const r of tables.recipes) {
    const list = (ingredients.get(r.id) ?? []).sort((a, b) => a.position - b.position);
    put(`households/${r.household_id}/recipes/${r.id}`, {
      ...without(r, 'id'),
      image_url: r.image_url ? (photoUrls[r.image_url] ?? r.image_url) : null,
      recipe_ingredients: list,
    });
  }

  for (const f of tables.favorites) {
    const household = recipeOwner.get(f.recipe_id);
    put(`households/${household}/favorites/${f.user_id}_${f.recipe_id}`, f);
  }

  // A plan's new id is its week; everything pointing at the plan follows.
  const plans = new Map(tables.week_plans.map((p) => [p.id, p]));
  const checks = new Map();
  for (const c of tables.shopping_checks) {
    if (!checks.has(c.week_plan_id)) checks.set(c.week_plan_id, []);
    checks.get(c.week_plan_id).push(c.item_key);
  }
  for (const p of tables.week_plans) {
    put(`households/${p.household_id}/weekPlans/${p.week_start}`, {
      ...without(p, 'id'),
      legacy_id: p.id,
      checks: (checks.get(p.id) ?? []).sort(),
    });
  }
  const moved = (row, kind) => {
    const plan = plans.get(row.week_plan_id);
    if (!plan) problems.push(`${kind} hoort bij een onbekend weekplan: ${row.week_plan_id}`);
    return plan;
  };
  for (const m of tables.week_plan_meals) {
    const plan = moved(m, 'Gerecht');
    if (plan) put(`households/${plan.household_id}/meals/${m.id}`, { ...without(m, 'id'), week_plan_id: plan.week_start });
  }
  for (const c of tables.week_plan_choosers) {
    const plan = moved(c, 'Kiezer');
    if (plan) put(`households/${plan.household_id}/choosers/${plan.week_start}_${c.day}`, { ...c, week_plan_id: plan.week_start });
  }
  for (const e of tables.shopping_extras) {
    const plan = moved(e, 'Boodschap');
    if (plan) put(`households/${plan.household_id}/shoppingExtras/${e.id}`, { ...without(e, 'id'), week_plan_id: plan.week_start });
  }
  for (const t of tables.push_tokens) put(`pushTokens/${encodeURIComponent(t.token)}`, t);
  for (const s of tables.reminders_sent) {
    put(`households/${s.household_id}/remindersSent/${s.week_start}_${s.sent_on}`, without(s, 'household_id'));
  }

  // How many of each table should be there, to be sure no row fell through the cracks.
  const expectedCounts = {
    households: tables.households.length,
    inviteCodes: tables.households.length,
    profiles: tables.profiles.length,
    recipes: tables.recipes.length,
    favorites: tables.favorites.length,
    weekPlans: tables.week_plans.length,
    meals: tables.week_plan_meals.length,
    choosers: tables.week_plan_choosers.length,
    shoppingExtras: tables.shopping_extras.length,
    pushTokens: tables.push_tokens.length,
    remindersSent: tables.reminders_sent.length,
  };
  return { docs, problems, expectedCounts };
}

/** Whether everything still points at something that exists. */
export function danglingReferences(tables) {
  const problems = [];
  const warnings = [];
  const profiles = new Set(tables.profiles.map((p) => p.id));
  const recipes = new Set(tables.recipes.map((r) => r.id));
  const households = new Set(tables.households.map((h) => h.id));
  const plans = new Set(tables.week_plans.map((p) => p.id));
  const check = (ok, text, list = problems) => {
    if (!ok) list.push(text);
  };
  for (const p of tables.profiles) check(!p.household_id || households.has(p.household_id), `Profiel ${p.id}: onbekend gezin`);
  for (const r of tables.recipes) {
    check(households.has(r.household_id), `Recept ${r.id}: onbekend gezin`);
    check(!r.created_by || profiles.has(r.created_by), `Recept ${r.id}: onbekende maker`);
  }
  for (const i of tables.recipe_ingredients) check(recipes.has(i.recipe_id), `Ingrediënt ${i.id}: onbekend recept`);
  for (const f of tables.favorites) {
    check(recipes.has(f.recipe_id), `Favoriet: onbekend recept ${f.recipe_id}`);
    check(profiles.has(f.user_id), `Favoriet: onbekende gebruiker ${f.user_id}`);
  }
  for (const m of tables.week_plan_meals) {
    check(plans.has(m.week_plan_id), `Gerecht ${m.id}: onbekend weekplan`);
    check(!m.recipe_id || recipes.has(m.recipe_id), `Gerecht ${m.id}: onbekend recept`);
  }
  for (const c of tables.week_plan_choosers) {
    check(plans.has(c.week_plan_id), `Kiezer: onbekend weekplan ${c.week_plan_id}`);
    check(!c.chooser_id || profiles.has(c.chooser_id), `Kiezer: onbekende gebruiker ${c.chooser_id}`);
  }
  for (const e of tables.shopping_extras) check(plans.has(e.week_plan_id), `Boodschap ${e.id}: onbekend weekplan`);
  for (const t of tables.push_tokens) check(profiles.has(t.user_id), `Meldingsadres: onbekende gebruiker ${t.user_id}`);
  // These lists were never held to anything by the database: someone may have left since. The app
  // already ignores them, so they come along as they are.
  for (const h of tables.households) {
    for (const id of [...(h.chooser_rotation ?? []), ...(h.shopper_ids ?? [])]) {
      check(profiles.has(id), `Gezin ${h.id}: ${id} staat in de beurten of boodschappers maar bestaat niet meer`, warnings);
    }
  }
  return { problems, warnings };
}

/** The same value? Firestore keeps numbers and null as they are, so a plain comparison will do. */
export function differences(path, expected, actual, out = []) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      out.push(`${path}: lijst verschilt (${JSON.stringify(expected)} / ${JSON.stringify(actual)})`);
    } else {
      expected.forEach((v, i) => differences(`${path}[${i}]`, v, actual[i], out));
    }
  } else if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      differences(`${path}.${key}`, expected[key], actual[key], out);
    }
  } else if (expected !== actual) {
    out.push(`${path}: was ${JSON.stringify(expected)}, is ${JSON.stringify(actual)}`);
  }
  return out;
}
