import "server-only";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { requireSecret, type Env } from "@/lib/env";

// Appeals come from people who can't sign in, so the upload route trusts a short-lived token
// that the appeal action hands back for that one appeal instead of a session.
const TTL = 30 * 60 * 1000;

const payload = (appealId: string, exp: number) => `appeal-evidence:${appealId}:${exp}`;

export async function signEvidenceToken(env: Env, appealId: string, now = Date.now()): Promise<string> {
  const exp = now + TTL;
  return `${exp}.${await hmacSha256(requireSecret(env, "AUTH_SECRET"), payload(appealId, exp))}`;
}

export async function verifyEvidenceToken(env: Env, appealId: string, token: string, now = Date.now()): Promise<boolean> {
  const [rawExp, sig] = token.split(".");
  const exp = Number(rawExp);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  const expected = await hmacSha256(requireSecret(env, "AUTH_SECRET"), payload(appealId, exp));
  return safeEqual(expected, sig);
}
