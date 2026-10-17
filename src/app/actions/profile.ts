"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { categoryFollows, users } from "@/db/schema";
import { checkPhoneCode, sendPhoneCode } from "@/lib/auth/login";
import { requireUser } from "@/lib/auth/current";
import { isCategory } from "@/lib/categories";
import { addFriend, removeFriend, respondToFriend } from "@/lib/friends";
import { pushToUsers } from "@/lib/live";
import { toE164 } from "@/lib/phone";
import { allow } from "@/lib/rate-limit";
import { db, env } from "@/lib/server";
import { safeNext } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

const cleanHandle = (v: string | null | undefined) => {
  const h = (v ?? "").trim().replace(/^[@$]/, "");
  return h && /^[A-Za-z0-9_-]{1,30}$/.test(h) ? h : null;
};

export async function saveProfile(input: { name: string; venmo?: string; cashapp?: string }): Promise<Result> {
  const user = await requireUser({ allowUnonboarded: true });
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) return { ok: false, error: "Add your name so people know who they're meeting." };
  if (input.venmo && !cleanHandle(input.venmo)) return { ok: false, error: "That Venmo username doesn't look right." };
  if (input.cashapp && !cleanHandle(input.cashapp)) return { ok: false, error: "That Cash App $cashtag doesn't look right." };
  await db()
    .update(users)
    .set({ name, venmo: cleanHandle(input.venmo), cashapp: cleanHandle(input.cashapp) })
    .where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function startPhoneVerification(rawPhone: string): Promise<Result> {
  const user = await requireUser({ allowUnonboarded: true });
  const phone = toE164(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid US phone number." };
  const taken = await db()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), ne(users.id, user.id)))
    .limit(1);
  if (taken.length) return { ok: false, error: "That number is already on another account." };
  if (!(await allow(env(), "AUTH_LIMITER", `verify:${user.id}`))) return { ok: false, error: "Too many tries. Wait a minute." };
  try {
    await sendPhoneCode(env(), db(), phone, "verify", user.id);
    return { ok: true };
  } catch (err) {
    console.error("startPhoneVerification", err);
    return { ok: false, error: "We couldn't text that number right now." };
  }
}

export async function confirmPhone(rawPhone: string, code: string): Promise<Result> {
  const user = await requireUser({ allowUnonboarded: true });
  const phone = toE164(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid US phone number." };
  const checked = await checkPhoneCode(env(), db(), phone, "verify", code);
  if (!checked || checked.userId !== user.id) return { ok: false, error: "That code didn't work." };
  try {
    await db().update(users).set({ phone, phoneVerifiedAt: new Date() }).where(eq(users.id, user.id));
  } catch {
    return { ok: false, error: "That number is already on another account." };
  }
  revalidatePath("/me");
  return { ok: true };
}

export async function removePhone(): Promise<Result> {
  const user = await requireUser();
  await db().update(users).set({ phone: null, phoneVerifiedAt: null, smsAlerts: false }).where(eq(users.id, user.id));
  revalidatePath("/me");
  return { ok: true };
}

export async function setSmsAlerts(on: boolean): Promise<Result> {
  const user = await requireUser();
  if (on && !(user.phone && user.phoneVerifiedAt)) return { ok: false, error: "Verify a phone number first." };
  await db().update(users).set({ smsAlerts: on }).where(eq(users.id, user.id));
  revalidatePath("/me");
  return { ok: true };
}

export async function setFollows(categories: string[]): Promise<Result> {
  const user = await requireUser({ allowUnonboarded: true });
  const clean = [...new Set(categories.filter(isCategory))];
  await db().delete(categoryFollows).where(eq(categoryFollows.userId, user.id));
  if (clean.length) await db().insert(categoryFollows).values(clean.map((category) => ({ userId: user.id, category })));
  revalidatePath("/");
  return { ok: true };
}

export async function toggleFollow(category: string, follow: boolean): Promise<Result> {
  const user = await requireUser();
  if (!isCategory(category)) return { ok: false, error: "Unknown category." };
  if (follow) await db().insert(categoryFollows).values({ userId: user.id, category }).onConflictDoNothing();
  else
    await db()
      .delete(categoryFollows)
      .where(and(eq(categoryFollows.userId, user.id), eq(categoryFollows.category, category)));
  revalidatePath("/");
  return { ok: true };
}

export async function finishOnboarding(next?: string | null) {
  const user = await requireUser({ allowUnonboarded: true });
  if (!user.name) redirect("/welcome");
  await db().update(users).set({ onboardedAt: new Date() }).where(eq(users.id, user.id));
  redirect(safeNext(next) ?? "/");
}

export async function friendAction(otherId: string, action: "add" | "accept" | "decline" | "remove"): Promise<Result> {
  const user = await requireUser();
  if (otherId === user.id) return { ok: false, error: "That's you." };
  if (action === "add") await addFriend(db(), user.id, otherId);
  else if (action === "accept") await respondToFriend(db(), user.id, otherId, true);
  else if (action === "decline") await respondToFriend(db(), user.id, otherId, false);
  else await removeFriend(db(), user.id, otherId);
  await pushToUsers(env(), [otherId, user.id], { type: "friends" });
  revalidatePath("/", "layout");
  return { ok: true };
}
