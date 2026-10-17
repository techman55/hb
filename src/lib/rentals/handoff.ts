// Proof that a pickup or return actually happened in person. The renter shows a code that
// rotates every 30 seconds; the owner scans it (or types the 6 digits). Unit-tested.

import { base64UrlToBytes, hmacSha256, hotp, safeEqual } from "@/lib/crypto";

export type HandoffAction = "pickup" | "return";
export const STEP_SECONDS = 30;
const QR_TTL_SECONDS = 120;
const PREFIX = "DIBS1";

function counter(step: number, action: HandoffAction) {
  return step * 2 + (action === "return" ? 1 : 0);
}

export async function numericCode(secret: string, action: HandoffAction, now = Date.now()) {
  return hotp(base64UrlToBytes(secret), counter(Math.floor(now / 1000 / STEP_SECONDS), action));
}

export async function qrPayload(authSecret: string, rentalId: string, action: HandoffAction, now = Date.now()) {
  const exp = Math.floor(now / 1000) + QR_TTL_SECONDS;
  const sig = (await hmacSha256(authSecret, `${rentalId}:${action}:${exp}`)).slice(0, 22);
  return `${PREFIX}:${rentalId}:${action}:${exp}:${sig}`;
}

/** Accepts either a scanned QR payload or a typed 6-digit code. */
export async function verifyHandoff(opts: {
  input: string;
  rentalId: string;
  action: HandoffAction;
  handoffSecret: string;
  authSecret: string;
  now?: number;
}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const input = opts.input.trim();

  if (input.startsWith(`${PREFIX}:`)) {
    const [, rentalId, action, expRaw, sig] = input.split(":");
    const exp = Number(expRaw);
    if (rentalId !== opts.rentalId || action !== opts.action || !Number.isFinite(exp)) return false;
    if (exp * 1000 < now) return false;
    const expected = (await hmacSha256(opts.authSecret, `${rentalId}:${action}:${exp}`)).slice(0, 22);
    return safeEqual(expected, sig ?? "");
  }

  const digits = input.replace(/\D/g, "");
  if (digits.length !== 6) return false;
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  for (const s of [step, step - 1, step + 1]) {
    const code = await hotp(base64UrlToBytes(opts.handoffSecret), counter(s, opts.action));
    if (safeEqual(code, digits)) return true;
  }
  return false;
}
