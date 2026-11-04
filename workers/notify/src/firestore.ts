// Firestore over its REST API, signed in as the service account: the Admin SDK doesn't run on Workers.
import { fromB64, toB64 } from './webpush.ts';

export type Config = {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  /** For testing against the emulators only: never set on Cloudflare. */
  FIRESTORE_EMULATOR_URL?: string;
};

export type Row = Record<string, any> & { id: string };

const text = new TextEncoder();
const b64json = (o: object) => toB64(text.encode(JSON.stringify(o)));

// A Worker stays alive for a while: no need to sign in again every time.
let token: { value: string; until: number } | null = null;

async function accessToken(env: Config) {
  if (env.FIRESTORE_EMULATOR_URL) return 'owner';
  if (token && token.until > Date.now()) return token.value;
  const pem = env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n').replace(/-----[^-]+-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', fromB64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const at = Math.floor(Date.now() / 1000);
  const body = `${b64json({ alg: 'RS256', typ: 'JWT' })}.${b64json({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: at,
    exp: at + 3600,
  })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, text.encode(body));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${body}.${toB64(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`Inloggen bij Firestore lukte niet (${response.status})`);
  const result = (await response.json()) as { access_token: string; expires_in: number };
  token = { value: result.access_token, until: Date.now() + (result.expires_in - 60) * 1000 };
  return token.value;
}

function toValue(v: unknown): object {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
}

const toFields = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));

function fromValue(v: any): any {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields ?? {});
  return null;
}

const fromFields = (fields: Record<string, any>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));

const rowOf = (document: { name: string; fields?: Record<string, any> }): Row => ({
  ...fromFields(document.fields ?? {}),
  id: document.name.slice(document.name.lastIndexOf('/') + 1),
});

export function firestore(env: Config) {
  const base = `${env.FIRESTORE_EMULATOR_URL ?? 'https://firestore.googleapis.com'}/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken(env)}` },
    });
    return response;
  }

  async function failed(response: Response) {
    return new Error(`Firestore ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  return {
    async get(path: string): Promise<Row | null> {
      const response = await request(`/${path}`);
      if (response.status === 404) return null;
      if (!response.ok) throw await failed(response);
      return rowOf(await response.json());
    },

    /** All documents of a collection where a field is (one of) the given value(s). */
    async where(collection: string, field?: string, value?: unknown): Promise<Row[]> {
      const at = collection.lastIndexOf('/');
      const parent = at === -1 ? '' : `/${collection.slice(0, at)}`;
      const collectionId = collection.slice(at + 1);
      const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] };
      if (field) {
        structuredQuery.where = {
          fieldFilter: {
            field: { fieldPath: field },
            op: Array.isArray(value) ? 'IN' : 'EQUAL',
            value: toValue(value),
          },
        };
      }
      const response = await request(`${parent}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
      if (!response.ok) throw await failed(response);
      const rows = (await response.json()) as { document?: { name: string; fields?: Record<string, any> } }[];
      return rows.flatMap((r) => (r.document ? [rowOf(r.document)] : []));
    },

    /** Creates a document; false if it's there already, so something happens only once. */
    async createOnce(collection: string, id: string, data: Record<string, unknown>) {
      const response = await request(`/${collection}?documentId=${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ fields: toFields(data) }),
      });
      if (response.status === 409) return false;
      if (!response.ok) throw await failed(response);
      return true;
    },

    /** Sets these fields, also when the document doesn't exist yet. */
    async merge(path: string, data: Record<string, unknown>) {
      const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      const response = await request(`/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: toFields(data) }) });
      if (!response.ok) throw await failed(response);
    },

    async remove(path: string) {
      const response = await request(`/${path}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw await failed(response);
    },
  };
}

/** Who's calling: a Firebase login token, checked against Google's public keys. */
export async function verifiedUser(env: Config, header: string | null): Promise<string | null> {
  const jwt = header?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const [head, payload, signature] = jwt.split('.');
  if (!head || !payload) return null;
  let claims: { aud?: string; iss?: string; exp?: number; sub?: string };
  let kid: string | undefined;
  try {
    kid = JSON.parse(atob(head.replace(/-/g, '+').replace(/_/g, '/'))).kid;
    claims = JSON.parse(new TextDecoder().decode(fromB64(payload)));
  } catch {
    return null;
  }
  if (claims.aud !== env.FIREBASE_PROJECT_ID) return null;
  if (claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) return null;
  if (!claims.exp || claims.exp * 1000 < Date.now() || !claims.sub) return null;
  // The emulators' tokens aren't signed. This is only ever set in tests.
  if (env.FIRESTORE_EMULATOR_URL) return claims.sub;

  if (!signature || !kid) return null;
  const keys = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!keys.ok) throw new Error('Inloggen controleren lukte niet.');
  const { keys: list } = (await keys.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const jwk = list.find((k) => k.kid === kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64(signature), text.encode(`${head}.${payload}`));
  return valid ? claims.sub : null;
}
