"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { listings, rentals } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { recomputeListingStatus } from "@/lib/listings/status";
import { closeOpenRentals } from "@/lib/rentals/service";
import { db, env } from "@/lib/server";

async function owned(id: string) {
  const user = await requireUser();
  const listing = (await db().select().from(listings).where(eq(listings.id, id)).limit(1))[0];
  return listing && listing.ownerId === user.id && listing.status !== "removed" ? listing : null;
}

export async function setPaused(id: string, paused: boolean) {
  const listing = await owned(id);
  if (!listing) return { ok: false as const, error: "Listing not found." };
  if (paused) {
    await db().update(listings).set({ status: "paused", updatedAt: new Date() }).where(eq(listings.id, id));
  } else {
    await db().update(listings).set({ status: "pending_verification", updatedAt: new Date() }).where(eq(listings.id, id));
    await recomputeListingStatus(env(), db(), id);
  }
  revalidatePath("/lending", "layout");
  return { ok: true as const };
}

export async function removeListing(id: string) {
  const listing = await owned(id);
  if (!listing) return { ok: false as const, error: "Listing not found." };
  const open = await db()
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.listingId, id), inArray(rentals.status, ["accepted", "active"])))
    .limit(1);
  if (open.length) return { ok: false as const, error: "Finish or cancel the current rental first." };
  await db().update(listings).set({ status: "removed", updatedAt: new Date() }).where(eq(listings.id, id));
  await closeOpenRentals(env(), db(), { listingId: id }, "listing_removed");
  revalidatePath("/lending");
  redirect("/lending");
}
