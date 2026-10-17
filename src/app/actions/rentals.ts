"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { cancelRental, requestDibs, respondToDibs } from "@/lib/rentals/service";
import { allow } from "@/lib/rate-limit";
import { db, env } from "@/lib/server";

export async function callDibs(input: { listingId: string; startDate: string; days: number; note?: string }) {
  const user = await requireUser();
  if (!(await allow(env(), "AUTH_LIMITER", `dibs:${user.id}`))) return { ok: false as const, error: "Slow down a little and try again." };
  const res = await requestDibs(env(), db(), user, input);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function answerDibs(rentalId: string, accept: boolean) {
  const user = await requireUser();
  const res = await respondToDibs(env(), db(), user, rentalId, accept);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function cancelDibs(rentalId: string) {
  const user = await requireUser();
  const res = await cancelRental(env(), db(), user, rentalId);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
