// Passwordless sign-in: a magic link + 6-digit code by email (always required the first time),
// then optional SMS codes for returning users with a verified phone.

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { loginTokens, smsCodes, users, type School, type User } from "@/db/schema";
import { hashCode, newId, randomDigits, randomToken, safeEqual, sha256Hex } from "@/lib/crypto";
import { magicLinkEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { adminEmails, appUrl, requireSecret, type Env } from "@/lib/env";
import { resolveEmailAccess, type AccessDenied } from "@/lib/schools/service";
import { normalizeEmail } from "@/lib/schools/domains";
import { sendSms } from "@/lib/sms";
import { safeNext } from "@/lib/utils";

const LINK_TTL = 15 * 60 * 1000;
const SMS_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type StartResult = { ok: true; school: School } | { ok: false; reason: AccessDenied | "banned" };

export async function startEmailLogin(env: Env, db: DB, rawEmail: string, redirectTo?: string | null): Promise<StartResult> {
  const email = normalizeEmail(rawEmail);
  const access = await resolveEmailAccess(db, email);
  if (!access.ok) return access;

  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing?.status === "banned") return { ok: false, reason: "banned" };

  const secret = requireSecret(env, "AUTH_SECRET");
  const token = randomToken();
  const code = randomDigits(6);
  await db.insert(loginTokens).values({
    id: await sha256Hex(token),
    email,
    codeHash: await hashCode(secret, `login:${email}`, code),
    redirectTo: safeNext(redirectTo),
    expiresAt: new Date(Date.now() + LINK_TTL),
  });
  await sendEmail(
    env,
    magicLinkEmail({ to: email, url: appUrl(env, `/auth/verify?token=${token}`), code, schoolName: access.school.name }),
  );
  return { ok: true, school: access.school };
}

export type Consumed = { email: string; redirectTo: string | null } | null;

export async function consumeLinkToken(db: DB, token: string): Promise<Consumed> {
  const id = await sha256Hex(token);
  const row = (await db.select().from(loginTokens).where(eq(loginTokens.id, id)).limit(1))[0];
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  const res = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.id, id), isNull(loginTokens.usedAt)))
    .returning({ id: loginTokens.id });
  return res.length ? { email: row.email, redirectTo: row.redirectTo } : null;
}

export async function consumeEmailCode(env: Env, db: DB, rawEmail: string, code: string): Promise<Consumed> {
  const email = normalizeEmail(rawEmail);
  // Any recent, unused email counts: if someone taps "send again", the first email's code still works.
  const rows = await db
    .select()
    .from(loginTokens)
    .where(and(eq(loginTokens.email, email), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
    .orderBy(desc(loginTokens.createdAt))
    .limit(3);
  const live = rows.filter((r) => r.attempts < MAX_ATTEMPTS);
  if (!live.length) return null;
  const expected = await hashCode(requireSecret(env, "AUTH_SECRET"), `login:${email}`, code.trim());
  const row = live.find((r) => safeEqual(expected, r.codeHash));
  if (!row) {
    await db.update(loginTokens).set({ attempts: live[0].attempts + 1 }).where(eq(loginTokens.id, live[0].id));
    return null;
  }
  const res = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.id, row.id), isNull(loginTokens.usedAt)))
    .returning({ id: loginTokens.id });
  return res.length ? { email, redirectTo: row.redirectTo } : null;
}

/** Finds or creates the user for a verified email. Re-checks access in case rules changed. */
export async function completeEmailLogin(env: Env, db: DB, email: string): Promise<User | null> {
  const access = await resolveEmailAccess(db, email);
  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  const isAdmin = adminEmails(env).includes(email);

  if (existing) {
    if (existing.status === "banned") return null;
    const patch: Partial<User> = { lastSeenAt: new Date(), emailVerifiedAt: existing.emailVerifiedAt ?? new Date() };
    if (isAdmin && existing.role !== "admin") patch.role = "admin";
    await db.update(users).set(patch).where(eq(users.id, existing.id));
    return { ...existing, ...patch };
  }
  if (!access.ok) return null;

  const user: typeof users.$inferInsert = {
    id: newId("usr"),
    email,
    schoolId: access.school.id,
    role: isAdmin ? "admin" : "user",
    friendCode: randomToken(6),
    emailVerifiedAt: new Date(),
    lastSeenAt: new Date(),
  };
  await db.insert(users).values(user);
  return (await db.select().from(users).where(eq(users.id, user.id!)).limit(1))[0];
}

// ── SMS ────────────────────────────────────────────────────────────

export async function sendPhoneCode(
  env: Env,
  db: DB,
  phone: string,
  purpose: "login" | "verify",
  userId?: string,
): Promise<{ ok: boolean }> {
  if (purpose === "login") {
    // Only verified phones can sign in. Answer the same way either way so numbers can't be probed.
    const owner = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
    if (!owner?.phoneVerifiedAt || owner.status === "banned") return { ok: true };
    userId = owner.id;
  }
  const code = randomDigits(6);
  await db.insert(smsCodes).values({
    id: newId("sms"),
    phone,
    userId: userId ?? null,
    purpose,
    codeHash: await hashCode(requireSecret(env, "AUTH_SECRET"), `sms:${purpose}:${phone}`, code),
    expiresAt: new Date(Date.now() + SMS_TTL),
  });
  await sendSms(env, phone, `${code} is your Dibs code. It expires in 10 minutes.`);
  return { ok: true };
}

export async function checkPhoneCode(
  env: Env,
  db: DB,
  phone: string,
  purpose: "login" | "verify",
  code: string,
): Promise<{ userId: string | null } | null> {
  const row = (
    await db
      .select()
      .from(smsCodes)
      .where(
        and(
          eq(smsCodes.phone, phone),
          eq(smsCodes.purpose, purpose),
          isNull(smsCodes.usedAt),
          gt(smsCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(smsCodes.createdAt))
      .limit(1)
  )[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return null;
  const expected = await hashCode(requireSecret(env, "AUTH_SECRET"), `sms:${purpose}:${phone}`, code.trim());
  if (!safeEqual(expected, row.codeHash)) {
    await db.update(smsCodes).set({ attempts: row.attempts + 1 }).where(eq(smsCodes.id, row.id));
    return null;
  }
  await db.update(smsCodes).set({ usedAt: new Date() }).where(eq(smsCodes.id, row.id));
  return { userId: row.userId };
}
