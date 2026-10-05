const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a base64 string into an ArrayBuffer (for uploading picked images). */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = CHARS.indexOf(clean[i]);
    const b = CHARS.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? CHARS.indexOf(clean[i + 2]) : 0;
    const d = i + 3 < clean.length ? CHARS.indexOf(clean[i + 3]) : 0;
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (i + 2 < clean.length) bytes[byteIndex++] = (chunk >> 8) & 0xff;
    if (i + 3 < clean.length) bytes[byteIndex++] = chunk & 0xff;
  }
  return bytes.buffer.slice(0, byteIndex);
}
