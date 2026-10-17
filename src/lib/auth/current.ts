import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { schools, type User } from "@/db/schema";
import { db, env } from "@/lib/server";
import { toPublicSchool } from "@/lib/schools/service";
import { createSession, deleteSession, SESSION_TTL, sessionCookieName, validateSessionToken } from "./session";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  return validateSessionToken(db(), jar.get(sessionCookieName(env()))?.value);
});

/** Pages and actions that need a signed-in, onboarded user. */
export async function requireUser(opts: { allowUnonboarded?: boolean; next?: string } = {}): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(opts.next ? `/login?next=${encodeURIComponent(opts.next)}` : "/login");
  if (!user.onboardedAt && !opts.allowUnonboarded) redirect("/welcome");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export const getUserSchool = cache(async (schoolId: string) => {
  const row = (await db().select().from(schools).where(eq(schools.id, schoolId)).limit(1))[0];
  return row ? toPublicSchool(row) : null;
});

export async function signIn(userId: string) {
  const jar = await cookies();
  const h = await headers();
  const { token } = await createSession(db(), userId, h.get("user-agent"));
  const secure = (env().APP_URL ?? "").startsWith("https://");
  jar.set(sessionCookieName(env()), token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL / 1000),
  });
}

export async function signOut() {
  const jar = await cookies();
  const name = sessionCookieName(env());
  const token = jar.get(name)?.value;
  if (token) await deleteSession(db(), token);
  jar.delete(name);
}

/** Route-handler variant: returns null instead of redirecting. */
export async function apiUser(): Promise<User | null> {
  const user = await getCurrentUser();
  return user && user.onboardedAt ? user : null;
}
