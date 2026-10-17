// Session storage, independent of Next.js so worker.ts (chat sockets) can use it too.

import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { randomToken, sha256Hex } from "@/lib/crypto";
import type { Env } from "@/lib/env";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 60 * DAY;
const REFRESH_WHEN_LEFT = 30 * DAY;

/** `__Host-` cookies must be Secure, which browsers refuse on plain-http localhost. */
export function sessionCookieName(env: Env): string {
  return (env.APP_URL ?? "").startsWith("https://") ? "__Host-dibs_session" : "dibs_session";
}

export async function createSession(db: DB, userId: string, userAgent?: string | null) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL);
  await db.insert(sessions).values({
    id: await sha256Hex(token),
    userId,
    expiresAt,
    userAgent: userAgent?.slice(0, 200) ?? null,
  });
  return { token, expiresAt };
}

export async function validateSessionToken(db: DB, token: string | undefined | null): Promise<User | null> {
  if (!token || token.length < 20) return null;
  const id = await sha256Hex(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() < now || row.user.status === "banned") {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (row.session.expiresAt.getTime() - now < REFRESH_WHEN_LEFT) {
    await db.update(sessions).set({ expiresAt: new Date(now + SESSION_TTL) }).where(eq(sessions.id, id));
  }
  return row.user;
}

export async function deleteSession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)));
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
