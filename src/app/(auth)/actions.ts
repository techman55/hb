"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { schools, users } from "@/db/schema";
import {
  checkPhoneCode,
  completeEmailLogin,
  consumeEmailCode,
  consumeLinkToken,
  sendPhoneCode,
  startEmailLogin,
} from "@/lib/auth/login";
import { signIn, signOut } from "@/lib/auth/current";
import { adminEmails } from "@/lib/env";
import { normalizeEmail } from "@/lib/schools/domains";
import { allow } from "@/lib/rate-limit";
import { toE164 } from "@/lib/phone";
import { safeNext } from "@/lib/utils";
import { db, env } from "@/lib/server";

type Result = { ok: true } | { ok: false; error: string };

const DENIED: Record<string, string> = {
  invalid: "That doesn't look like an email address.",
  not_edu: "Use your school's .edu email. Using a different school email? Request access below.",
  blocked: "This email domain can't be used to sign in.",
  disabled: "Your school isn't open on Dibs right now.",
  banned: "This account has been suspended. Contact support if you think that's a mistake.",
};

async function clientKey() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for") ?? "local";
}

function landing(next: string | null | undefined, onboarded: boolean) {
  const path = safeNext(next);
  if (!onboarded) return path ? `/welcome?next=${encodeURIComponent(path)}` : "/welcome";
  return path ?? "/";
}

export async function sendLoginLink(email: string, next?: string | null): Promise<Result> {
  const e = env();
  const ip = await clientKey();
  if (!(await allow(e, "AUTH_LIMITER", `ip:${ip}`)) || !(await allow(e, "AUTH_LIMITER", `email:${normalizeEmail(email)}`))) {
    return { ok: false, error: "Too many tries. Wait a minute and try again." };
  }
  try {
    const res = await startEmailLogin(e, db(), email, next);
    return res.ok ? { ok: true } : { ok: false, error: DENIED[res.reason] ?? "We couldn't send a link." };
  } catch (err) {
    console.error("sendLoginLink", err);
    return { ok: false, error: "We couldn't send the email. Try again in a moment." };
  }
}

export async function verifyEmailCode(email: string, code: string, next?: string | null): Promise<Result> {
  const e = env();
  if (!(await allow(e, "AUTH_LIMITER", `code:${normalizeEmail(email)}`))) {
    return { ok: false, error: "Too many tries. Wait a minute and try again." };
  }
  const consumed = await consumeEmailCode(e, db(), email, code);
  if (!consumed) return { ok: false, error: "That code didn't work. Check it, or send a new link." };
  const user = await completeEmailLogin(e, db(), consumed.email);
  if (!user) return { ok: false, error: DENIED.not_edu };
  await signIn(user.id);
  redirect(landing(next ?? consumed.redirectTo, !!user.onboardedAt));
}

export async function redeemLinkToken(token: string): Promise<Result> {
  const consumed = await consumeLinkToken(db(), token);
  if (!consumed) return { ok: false, error: "This link has expired or was already used." };
  const user = await completeEmailLogin(env(), db(), consumed.email);
  if (!user) return { ok: false, error: "This email can't sign in to Dibs." };
  await signIn(user.id);
  redirect(landing(consumed.redirectTo, !!user.onboardedAt));
}

export async function sendPhoneLogin(rawPhone: string): Promise<Result> {
  const phone = toE164(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid phone number." };
  const e = env();
  if (!(await allow(e, "AUTH_LIMITER", `phone:${phone}`)) || !(await allow(e, "AUTH_LIMITER", `ip:${await clientKey()}`))) {
    return { ok: false, error: "Too many tries. Wait a minute and try again." };
  }
  try {
    await sendPhoneCode(e, db(), phone, "login");
    return { ok: true };
  } catch (err) {
    console.error("sendPhoneLogin", err);
    return { ok: false, error: "We couldn't send a text right now. Use your email instead." };
  }
}

export async function verifyPhoneLogin(rawPhone: string, code: string, next?: string | null): Promise<Result> {
  const phone = toE164(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid phone number." };
  const e = env();
  if (!(await allow(e, "AUTH_LIMITER", `phonecode:${phone}`))) {
    return { ok: false, error: "Too many tries. Wait a minute and try again." };
  }
  const checked = await checkPhoneCode(e, db(), phone, "login", code);
  if (!checked?.userId) return { ok: false, error: "That code didn't work." };
  const user = (await db().select().from(users).where(eq(users.id, checked.userId)).limit(1))[0];
  if (!user || user.status === "banned" || user.phone !== phone) return { ok: false, error: "That code didn't work." };
  const school = (await db().select({ enabled: schools.enabled }).from(schools).where(eq(schools.id, user.schoolId)).limit(1))[0];
  if (!school?.enabled) return { ok: false, error: DENIED.disabled };
  if (user.role !== "admin" && adminEmails(e).includes(user.email)) {
    await db().update(users).set({ role: "admin" }).where(eq(users.id, user.id));
  }
  await signIn(user.id);
  redirect(landing(next, !!user.onboardedAt));
}

export async function logout() {
  await signOut();
  redirect("/login");
}
