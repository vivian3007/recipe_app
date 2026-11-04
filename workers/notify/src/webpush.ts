// Web push with what Workers have built in (RFC 8291 for the message, RFC 8292 for who sends it).
// The usual web-push library needs Node's crypto; this also uses less of the little CPU time there is.

export const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const toB64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const text = new TextEncoder();

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, secret: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

const rawKeyToJwk = (publicKey: Uint8Array, d?: string) => ({
  kty: 'EC',
  crv: 'P-256',
  x: toB64(publicKey.slice(1, 33)),
  y: toB64(publicKey.slice(33, 65)),
  ...(d ? { d } : {}),
  ext: true,
});

/** Encrypts a message for one browser. The two test values only exist for the RFC's own example. */
export async function encrypt(
  message: string,
  p256dh: string,
  auth: string,
  fixed?: { serverPublic: string; serverPrivate: string; salt: string },
) {
  const browserKey = fromB64(p256dh);
  const browser = await crypto.subtle.importKey('raw', browserKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  let serverPublic: Uint8Array;
  let serverPrivate: CryptoKey;
  if (fixed) {
    serverPublic = fromB64(fixed.serverPublic);
    serverPrivate = await crypto.subtle.importKey(
      'jwk',
      rawKeyToJwk(serverPublic, fixed.serverPrivate),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    serverPublic = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
    serverPrivate = pair.privateKey;
  }
  const salt = fixed ? fromB64(fixed.salt) : crypto.getRandomValues(new Uint8Array(16));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: browser }, serverPrivate, 256));

  const ikm = await hkdf(fromB64(auth), shared, concat(text.encode('WebPush: info\0'), browserKey, serverPublic), 32);
  const cek = await hkdf(salt, ikm, text.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(text.encode(message), new Uint8Array([2]))),
  );
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = serverPublic.length;
  return concat(header, serverPublic, sealed);
}

/** Proves to the browser's push service that this comes from the app (the same keys as ever). */
export async function vapidHeader(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const key = await crypto.subtle.importKey(
    'jwk',
    rawKeyToJwk(fromB64(publicKey), privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const part = (o: object) => toB64(text.encode(JSON.stringify(o)));
  const body = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text.encode(body));
  return `vapid t=${body}.${toB64(signature)}, k=${publicKey}`;
}
