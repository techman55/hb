// WebCrypto helpers. Works in Workers, Node 20+ and browsers; no Node-only imports.

const encoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** URL-safe random token (default 32 bytes ≈ 43 chars). */
export function randomToken(bytes = 32): string {
  return bytesToBase64Url(randomBytes(bytes));
}

const ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Short, sortable-enough random id with a readable prefix, e.g. `lst_8f3k2m9q1x7c`. */
export function newId(prefix: string, length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Uniform random numeric code, e.g. a 6-digit login code. */
export function randomDigits(length = 6): string {
  const max = 10 ** length;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % max).padStart(length, "0");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string | Uint8Array, hash: "SHA-1" | "SHA-256" = "SHA-256") {
  const raw = typeof secret === "string" ? encoder.encode(secret) : secret;
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash }, false, ["sign"]);
}

export async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Hash a short code with the app secret so a leaked table can't be brute-forced offline. */
export async function hashCode(secret: string, scope: string, code: string): Promise<string> {
  return hmacSha256(secret, `${scope}:${code}`);
}

/** RFC 4226 HOTP over a raw secret; used for the 6-digit handoff fallback code. */
export async function hotp(secret: Uint8Array, counter: number, digits = 6): Promise<string> {
  const key = await hmacKey(secret, "SHA-1");
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}
