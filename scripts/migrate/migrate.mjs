// Moves everything from Supabase to Firebase. Supabase is only ever read (a read-only transaction),
// and it's safe to run this more than once: everything lands on the same place again.
//
//   node --env-file=<file outside this repo> migrate.mjs --project <firebase project id> [--check-only]
//
// The env file holds SUPABASE_DB_URL (the direct database connection), SUPABASE_URL,
// GOOGLE_APPLICATION_CREDENTIALS (path of a service account key) and CLOUDINARY_CLOUD_NAME,
// CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. Never put those files or the output in this repo:
// they hold keys, password hashes and the family's data.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { danglingReferences, differences, TABLES, toDocuments } from './transform.mjs';

/** Rows of all tables and the login accounts, inside one read-only transaction. */
export async function readSupabase(connectionString) {
  const { default: pg } = await import('pg');
  // As text where JavaScript would change them: numbers stay numbers, dates stay the date they are.
  pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
  pg.types.setTypeParser(1082, (v) => v); // date
  pg.types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString())); // timestamptz
  pg.types.setTypeParser(1114, (v) => (v === null ? null : new Date(`${v}Z`).toISOString())); // timestamp
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const tables = {};
    for (const table of TABLES) tables[table] = (await client.query(`select * from public.${table}`)).rows;
    const users = (
      await client.query(
        'select id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, last_sign_in_at from auth.users',
      )
    ).rows;
    const photos = (await client.query(`select name from storage.objects where bucket_id = 'recipe-images'`)).rows;
    await client.query('ROLLBACK');
    return { tables, users, photos };
  } finally {
    await client.end();
  }
}

/** Supabase keeps bcrypt hashes, which Firebase can check: everyone keeps their password. */
export async function importUsers(auth, allUsers) {
  const problems = [];
  // Whoever has an account here already keeps it as it is, so running this again is safe.
  const existing = new Set();
  for (let at = 0; at < allUsers.length; at += 100) {
    const { users } = await auth.getUsers(allUsers.slice(at, at + 100).map((u) => ({ uid: u.id })));
    users.forEach((u) => existing.add(u.uid));
  }
  const users = allUsers.filter((u) => !existing.has(u.id));
  for (let at = 0; at < users.length; at += 1000) {
    const batch = users.slice(at, at + 1000).map((u) => ({
      uid: u.id,
      email: u.email,
      emailVerified: !!u.email_confirmed_at,
      displayName: u.raw_user_meta_data?.display_name || undefined,
      ...(u.encrypted_password ? { passwordHash: Buffer.from(u.encrypted_password) } : {}),
      metadata: {
        creationTime: u.created_at ? new Date(u.created_at).toUTCString() : undefined,
        lastSignInTime: u.last_sign_in_at ? new Date(u.last_sign_in_at).toUTCString() : undefined,
      },
    }));
    const result = await auth.importUsers(batch, { hash: { algorithm: 'BCRYPT' } });
    for (const e of result.errors) problems.push(`Account ${batch[e.index].email}: ${e.error.message}`);
  }
  return problems;
}

export async function writeDocuments(db, docs) {
  const writer = db.bulkWriter();
  const problems = [];
  writer.onWriteError((e) => {
    if (e.failedAttempts < 5) return true;
    problems.push(`${e.documentRef.path}: ${e.message}`);
    return false;
  });
  for (const [path, data] of docs) writer.set(db.doc(path), data);
  await writer.close();
  return problems;
}

const COUNTED = {
  households: 'households',
  inviteCodes: 'inviteCodes',
  profiles: 'profiles',
  pushTokens: 'pushTokens',
};

/** Every expected document exactly as expected, every photo there, nothing that shouldn't be there. */
export async function check(db, auth, { docs, expectedCounts, tables, users }) {
  const problems = [];
  const counted = {};

  const refs = [...docs.keys()].map((path) => db.doc(path));
  for (let at = 0; at < refs.length; at += 300) {
    const slice = refs.slice(at, at + 300);
    const snapshots = await db.getAll(...slice);
    snapshots.forEach((snapshot) => {
      const path = snapshot.ref.path;
      if (!snapshot.exists) problems.push(`Ontbreekt: ${path}`);
      else problems.push(...differences(path, docs.get(path), snapshot.data()));
    });
  }

  for (const [name, collection] of Object.entries(COUNTED)) counted[name] = (await db.collection(collection).count().get()).data().count;
  for (const name of ['recipes', 'favorites', 'weekPlans', 'meals', 'choosers', 'shoppingExtras', 'remindersSent']) {
    counted[name] = (await db.collectionGroup(name).count().get()).data().count;
  }
  const lines = [];
  for (const [name, expected] of Object.entries(expectedCounts)) {
    const ok = counted[name] === expected;
    lines.push(`  ${ok ? 'ok ' : 'FOUT'} ${name.padEnd(16)} verwacht ${String(expected).padStart(5)}, staat er ${String(counted[name]).padStart(5)}`);
    if (!ok) problems.push(`Aantal ${name}: verwacht ${expected}, staat er ${counted[name]}`);
  }

  // Ingredients and ticks live inside their recipe and week, so those are counted by hand.
  let ingredients = 0;
  let ticks = 0;
  for (const [path, data] of docs) {
    if (/\/recipes\//.test(path)) ingredients += data.recipe_ingredients.length;
    if (/\/weekPlans\//.test(path)) ticks += data.checks.length;
  }
  for (const [name, inDocs, rows] of [
    ['ingrediënten', ingredients, tables.recipe_ingredients.length],
    ['vinkjes', ticks, tables.shopping_checks.length],
  ]) {
    lines.push(`  ${inDocs === rows ? 'ok ' : 'FOUT'} ${name.padEnd(16)} verwacht ${String(rows).padStart(5)}, staat er ${String(inDocs).padStart(5)}`);
    if (inDocs !== rows) problems.push(`Aantal ${name}: verwacht ${rows}, staat er ${inDocs}`);
  }

  const accounts = new Map();
  let page;
  do {
    const result = await auth.listUsers(1000, page);
    result.users.forEach((u) => accounts.set(u.uid, u));
    page = result.pageToken;
  } while (page);
  for (const u of users) {
    const found = accounts.get(u.id);
    if (!found) problems.push(`Account ontbreekt: ${u.email}`);
    else if (found.email !== u.email?.toLowerCase() && found.email !== u.email) problems.push(`Account ${u.email}: ander e-mailadres (${found.email})`);
  }
  const usersOk = accounts.size === users.length;
  lines.push(`  ${usersOk ? 'ok ' : 'FOUT'} ${'accounts'.padEnd(16)} verwacht ${String(users.length).padStart(5)}, staat er ${String(accounts.size).padStart(5)}`);
  if (!usersOk) problems.push(`Aantal accounts: verwacht ${users.length}, staat er ${accounts.size}`);
  return { problems, lines };
}

// ---------- Photos ----------

function cloudinarySign(fields, secret) {
  const line = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
  return createHash('sha1').update(`${line}${secret}`).digest('hex');
}

async function sha256Of(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
}

/** Copies every photo; what's been copied before is remembered in the output folder. */
async function copyPhotos(photos, mapFile) {
  const map = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};
  const problems = [];
  const { SUPABASE_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  for (const { name } of photos) {
    const source = `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${name}`;
    if (map[source]) continue;
    const fields = {
      overwrite: 'true',
      public_id: `recipe-images/${name.replace(/\.[^.]+$/, '')}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('api_key', CLOUDINARY_API_KEY);
    form.append('signature', cloudinarySign(fields, CLOUDINARY_API_SECRET));
    form.append('file', source);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.secure_url) {
      problems.push(`Foto ${name}: ${result?.error?.message ?? response.status}`);
      continue;
    }
    map[source] = result.secure_url;
    writeFileSync(mapFile, JSON.stringify(map, null, 1));
  }
  return { map, problems };
}

async function checkPhotos(tables, photos, map) {
  const problems = [];
  const bucket = `${process.env.SUPABASE_URL}/storage/v1/object/public/recipe-images/`;
  for (const { name } of photos) {
    const source = `${bucket}${name}`;
    if (!map[source]) {
      problems.push(`Foto niet gekopieerd: ${name}`);
      continue;
    }
    try {
      if ((await sha256Of(source)) !== (await sha256Of(map[source]))) problems.push(`Foto verschilt van het origineel: ${name}`);
    } catch (e) {
      problems.push(`Foto niet op te vragen: ${e.message}`);
    }
  }
  for (const r of tables.recipes) {
    if (r.image_url?.startsWith(bucket) && !map[r.image_url]) problems.push(`Recept "${r.title}": foto bestaat niet in Supabase (${r.image_url})`);
  }
  return problems;
}

// ---------- From the command line ----------

async function main() {
  const { values } = parseArgs({
    options: { project: { type: 'string' }, 'check-only': { type: 'boolean', default: false }, out: { type: 'string', default: '../../../weekmenu-migration' } },
  });
  if (!values.project) throw new Error('Geef met --project aan naar welk Firebase-project dit gaat.');
  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  const mapFile = resolve(out, 'photos.json');

  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))), projectId: values.project });
  const db = getFirestore(app);
  const auth = getAuth(app);

  console.log(`Doel: Firebase-project ${values.project}`);
  const { tables, users, photos } = await readSupabase(process.env.SUPABASE_DB_URL);
  console.log(`Gelezen: ${users.length} accounts, ${photos.length} foto's, ${TABLES.map((t) => `${tables[t].length} ${t}`).join(', ')}`);

  const references = danglingReferences(tables);
  const problems = [...references.problems];
  references.warnings.forEach((w) => console.log(`Let op: ${w}`));

  let map;
  if (values['check-only']) {
    map = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};
  } else {
    const copied = await copyPhotos(photos, mapFile);
    map = copied.map;
    problems.push(...copied.problems);
    problems.push(...(await importUsers(auth, users)));
  }
  const { docs, problems: transformed, expectedCounts } = toDocuments(tables, map);
  problems.push(...transformed);
  if (!values['check-only']) problems.push(...(await writeDocuments(db, docs)));

  const report = await check(db, auth, { docs, expectedCounts, tables, users });
  problems.push(...report.problems, ...(await checkPhotos(tables, photos, map)));
  console.log('\nControle:');
  report.lines.forEach((line) => console.log(line));
  console.log(`  foto's vergeleken met het origineel: ${photos.length}`);
  if (problems.length) {
    console.log(`\n${problems.length} PROBLEMEN, dit is NIET klaar om over te stappen:`);
    problems.slice(0, 100).forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log('\nAlles klopt.');
  process.exit(0);
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) await main();
