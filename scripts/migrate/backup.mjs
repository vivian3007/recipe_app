// A full copy of what's in Supabase: all tables, the login accounts and every photo, in one new
// folder. Only reads. Needs no pg_dump or Docker. Keep the result safe and out of this repo: it holds
// password hashes and the family's data.
//
//   node --env-file=<file outside this repo> backup.mjs [--out <folder>]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { readSupabase } from './migrate.mjs';
import { TABLES } from './transform.mjs';

const { values } = parseArgs({ options: { out: { type: 'string', default: '../../../weekmenu-migration' } } });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const folder = resolve(values.out, `backup-${stamp}`);
mkdirSync(resolve(folder, 'photos'), { recursive: true });

const { tables, users, photos } = await readSupabase(process.env.SUPABASE_DB_URL);
writeFileSync(resolve(folder, 'tables.json'), JSON.stringify(tables, null, 1));
writeFileSync(resolve(folder, 'users.json'), JSON.stringify(users, null, 1));

const manifest = [];
const failed = [];
for (const { name } of photos) {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/recipe-images/${name}`;
  const response = await fetch(url);
  if (!response.ok) {
    failed.push(`${name}: ${response.status}`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = resolve(folder, 'photos', name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  manifest.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
writeFileSync(resolve(folder, 'photos.json'), JSON.stringify(manifest, null, 1));

console.log(`Back-up in: ${folder}`);
console.log(`${users.length} accounts; ${TABLES.map((t) => `${tables[t].length} ${t}`).join(', ')}`);
console.log(`${manifest.length} van ${photos.length} foto's opgeslagen`);
if (failed.length) {
  console.log(`NIET COMPLEET, deze foto's ontbreken:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
console.log('Compleet.');
process.exit(0);
