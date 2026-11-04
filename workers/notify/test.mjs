// The worker against the Firestore emulator (firebase/: npm run emulators), with the outside world
// (Expo, browsers' push services) faked. Run with: node workers/notify/test.mjs
import { strict as assert } from 'node:assert';
import { createDecipheriv, createECDH, hkdfSync, webcrypto } from 'node:crypto';

import worker, { amsterdamNow, cloudinarySignature, sendReminders } from './src/index.ts';
import { encrypt, fromB64, toB64, vapidHeader } from './src/webpush.ts';

const EMULATOR = 'http://127.0.0.1:8080';
const PROJECT = 'demo-weekmenu';
const pass = (name) => console.log(`ok  ${name}`);

// ---------- RFC 8291's own example ----------
const rfc = await encrypt(
  'When I grow up, I want to be a watermelon',
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  'BTBZMqHH6r4Tts7J_aSIgg',
  {
    serverPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    serverPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  },
);
assert.equal(
  toB64(rfc),
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
);
pass('web push encryption matches RFC 8291');

// ---------- Decrypted the way a browser does it ----------
function decryptLikeABrowser(body, browser, auth) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const idLen = buf[20];
  const serverPublic = buf.subarray(21, 21 + idLen);
  const sealed = buf.subarray(21 + idLen);
  const shared = browser.computeSecret(serverPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), serverPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  return plain.subarray(0, plain.length - 1).toString();
}

// ---------- Cloudinary's documented example ----------
assert.equal(
  await cloudinarySignature({ timestamp: '1315060510', public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' }, 'abcd'),
  'bfd09f95f331f558cbd1320e67aa8d488770583e',
);
pass('photo signature matches Cloudinary\'s example');

// ---------- VAPID ----------
const vapidPair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapidPublic = toB64(await webcrypto.subtle.exportKey('raw', vapidPair.publicKey));
const vapidPrivate = (await webcrypto.subtle.exportKey('jwk', vapidPair.privateKey)).d;
const header = await vapidHeader('https://push.example.test/abc', vapidPublic, vapidPrivate, 'https://weekmenu.expo.app');
const [, jwt, key] = header.match(/^vapid t=([^,]+), k=(.+)$/);
const [h, p, s] = jwt.split('.');
assert.equal(key, vapidPublic);
assert.equal(JSON.parse(Buffer.from(p, 'base64url')).aud, 'https://push.example.test');
assert.ok(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapidPair.publicKey, fromB64(s), new TextEncoder().encode(`${h}.${p}`)));
pass('VAPID signature verifies');

// ---------- The outside world ----------
const realFetch = globalThis.fetch;
let expoCalls = [];
let pushCalls = [];
let expoGone = new Set();
let pushGone = new Set();
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (target.startsWith('https://exp.host/')) {
    const messages = JSON.parse(init.body);
    expoCalls.push(...messages);
    return Response.json({
      data: messages.map((m) => (expoGone.has(m.to) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })),
    });
  }
  if (target.startsWith('https://push.example.test/')) {
    pushCalls.push({ url: target, init });
    return new Response(null, { status: pushGone.has(target) ? 410 : 201 });
  }
  return realFetch(url, init);
};

const browser = createECDH('prime256v1');
browser.generateKeys();
const browserAuth = webcrypto.getRandomValues(new Uint8Array(16));

const env = {
  FIREBASE_PROJECT_ID: PROJECT,
  FIRESTORE_EMULATOR_URL: EMULATOR,
  VAPID_PUBLIC_KEY: vapidPublic,
  VAPID_PRIVATE_KEY: vapidPrivate,
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
};

// ---------- Test data ----------
const docs = `${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
await realFetch(`${docs}`, { method: 'DELETE', headers: owner });
const toValue = (v) =>
  v === null ? { nullValue: null }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(toValue) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
async function put(path, data) {
  const r = await realFetch(`${docs}/${path}`, {
    method: 'PATCH',
    headers: owner,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  assert.ok(r.ok, await r.text());
}
const read = async (path) => {
  const r = await realFetch(`${docs}/${path}`, { headers: owner });
  return r.ok ? r.json() : null;
};

// 2030-01-05 is a Saturday; the family shops on Mondays and wants a reminder at 9, 2 days before.
const atNine = new Date('2030-01-05T08:00:00Z'); // 9:00 in Amsterdam
assert.deepEqual(amsterdamNow(atNine), { today: '2030-01-05', hour: 9 });
await put('profiles/anna', { display_name: 'Anna', household_id: 'h1' });
await put('profiles/bert', { display_name: 'Bert', household_id: 'h1' });
await put('profiles/eve', { display_name: 'Eve', household_id: 'h2' });
await put('households/h1', {
  name: 'Een', invite_code: 'A', shopping_day: 0, chooser_rotation: ['anna', 'bert'], rotation_start: '2030-01-07',
  remind_days_before: 2, remind_hour: 9, shopper_ids: ['bert', 'anna', 'eve'],
});
await put('households/h2', {
  name: 'Twee', invite_code: 'B', shopping_day: 0, chooser_rotation: [], rotation_start: null, remind_days_before: 2, remind_hour: 9, shopper_ids: [],
});
await put('pushTokens/t-anna', { token: 'ExponentPushToken[anna]', user_id: 'anna', kind: 'expo', subscription: null });
await put('pushTokens/t-anna-oud', { token: 'ExponentPushToken[oud]', user_id: 'anna', kind: 'expo', subscription: null });
await put('pushTokens/t-bert', {
  token: 'https://push.example.test/bert',
  user_id: 'bert',
  kind: 'web',
  subscription: { endpoint: 'https://push.example.test/bert', keys: { p256dh: toB64(browser.getPublicKey()), auth: toB64(browserAuth) } },
});
await put('pushTokens/t-bert-oud', {
  token: 'https://push.example.test/oud',
  user_id: 'bert',
  kind: 'web',
  subscription: { endpoint: 'https://push.example.test/oud', keys: { p256dh: toB64(browser.getPublicKey()), auth: toB64(browserAuth) } },
});
await put('pushTokens/t-eve', { token: 'ExponentPushToken[eve]', user_id: 'eve', kind: 'expo', subscription: null });
expoGone = new Set(['ExponentPushToken[oud]']);
pushGone = new Set(['https://push.example.test/oud']);

// ---------- Reminders ----------
assert.deepEqual(await sendReminders(env, new Date('2030-01-05T07:00:00Z')), { reminded: 0 });
assert.equal(expoCalls.length, 0);
pass('no reminder at another hour');

assert.deepEqual(await sendReminders(env, new Date('2030-01-04T08:00:00Z')), { reminded: 0 });
pass('no reminder more days ahead than set');

let result = await sendReminders(env, atNine);
assert.equal(result.reminded, 1);
assert.equal(expoCalls.filter((m) => m.to === 'ExponentPushToken[anna]').length, 1, 'whoever\'s turn it is');
assert.match(expoCalls[0].body, /^Over 2 dagen worden de boodschappen gedaan.*maandag 7 jan/);
assert.deepEqual(expoCalls[0].data, { url: '/week', weekStart: '2030-01-07' });
assert.ok(!expoCalls.some((m) => m.to === 'ExponentPushToken[eve]'));
assert.equal(pushCalls.length, 0, 'not the one whose turn it isn\'t');
pass('reminder goes to whoever\'s turn it is, with the right text');

assert.equal(await read('pushTokens/t-anna-oud'), null);
assert.ok(await read('pushTokens/t-anna'));
pass('a phone that\'s gone is removed');

expoCalls = [];
assert.deepEqual(await sendReminders(env, atNine), { reminded: 0 });
assert.equal(expoCalls.length, 0);
pass('a second run in the same hour sends nothing');

await sendReminders(env, new Date('2030-01-06T08:00:00Z'));
assert.match(expoCalls[0].body, /^Morgen/);
pass('the next day another reminder: Morgen');

// Someone else chooses that day.
await put('households/h1/weekPlans/2030-01-14', { household_id: 'h1', week_start: '2030-01-14' });
await put('households/h1/choosers/2030-01-14_2', { week_plan_id: '2030-01-14', day: 2, chooser_id: 'anna' });
expoCalls = [];
pushCalls = [];
await sendReminders(env, new Date('2030-01-12T08:00:00Z'));
assert.equal(pushCalls.filter((c) => c.url.endsWith('/bert')).length, 1, 'bert\'s turn (rotation)');
assert.equal(expoCalls.length, 1, 'and anna for the day she chooses');
const message = JSON.parse(decryptLikeABrowser(new Uint8Array(pushCalls.find((c) => c.url.endsWith('/bert')).init.body), browser, browserAuth));
assert.match(message.title, /Kies het weekmenu/);
assert.equal(pushCalls[0].init.headers['Content-Encoding'], 'aes128gcm');
pass('a browser can read the web push; choosers for one day count too');
assert.equal(await read('pushTokens/t-bert-oud'), null);
pass('a browser that\'s gone is removed');

await put('households/h1/weekPlans/2030-01-21', { household_id: 'h1', week_start: '2030-01-21', ready_at: '2030-01-18T10:00:00Z' });
expoCalls = [];
pushCalls = [];
assert.deepEqual(await sendReminders(env, new Date('2030-01-19T08:00:00Z')), { reminded: 0 });
assert.equal(expoCalls.length + pushCalls.length, 0);
pass('no reminder when the week is ready');

// ---------- Called by the app ----------
const unsigned = (sub, overrides = {}) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none' })}.${b({
    sub,
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  })}.`;
};
const call = (path, body, token) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    env,
  );

assert.equal((await call('/ready', { weekStart: '2030-02-04' })).status, 401);
assert.equal((await call('/ready', { weekStart: '2030-02-04' }, unsigned('anna', { aud: 'iets-anders' }))).status, 401);
assert.equal((await call('/ready', { weekStart: '2030-02-04' }, unsigned('anna', { exp: 100 }))).status, 401);
pass('no login, another project\'s login or an expired one: refused');
assert.equal((await call('/ready', { weekStart: 'nonsense' }, unsigned('anna'))).status, 400);

expoCalls = [];
pushCalls = [];
let response = await call('/ready', { weekStart: '2030-02-04' }, unsigned('anna'));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { notified: 1, shoppers: 1 });
const plan = await read('households/h1/weekPlans/2030-02-04');
assert.equal(plan.fields.ready_by.stringValue, 'anna');
assert.ok(plan.fields.ready_at.stringValue);
assert.equal(pushCalls.length, 1, 'bert hears it');
assert.equal(expoCalls.length, 0, 'not anna herself, not eve from another family');
const ready = JSON.parse(decryptLikeABrowser(new Uint8Array(pushCalls[0].init.body), browser, browserAuth));
assert.equal(ready.body, 'Anna heeft de week van maandag 4 feb ingevuld. Het boodschappenlijstje staat klaar.');
assert.equal(ready.url, '/shopping');
pass('week ready: marked, and only the other shoppers of the family hear it');

// A plan that exists keeps what's in it.
await put('households/h1/weekPlans/2030-02-11', { household_id: 'h1', week_start: '2030-02-11', checks: ['a'] });
await call('/ready', { weekStart: '2030-02-11' }, unsigned('anna'));
assert.equal((await read('households/h1/weekPlans/2030-02-11')).fields.checks.arrayValue.values[0].stringValue, 'a');
pass('marking a week ready keeps its ticks');

response = await call('/photo', { householdId: 'h2' }, unsigned('anna'));
assert.equal(response.status, 403);
assert.equal((await call('/photo', { householdId: 'h1' })).status, 401);
response = await call('/photo', { householdId: 'h1' }, unsigned('anna'));
const photo = await response.json();
assert.equal(photo.uploadUrl, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload');
assert.equal(photo.fields.folder, 'recipe-images/h1');
assert.equal(photo.fields.api_key, 'test-key');
assert.equal(photo.fields.signature, await cloudinarySignature({ folder: photo.fields.folder, timestamp: photo.fields.timestamp }, 'test-secret'));
assert.ok(!JSON.stringify(photo).includes('test-secret'));
pass('photos only into your own family\'s folder; the secret stays on the server');

console.log('\nAlles geslaagd');
process.exit(0);
