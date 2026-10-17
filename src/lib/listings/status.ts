import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { listingPhotos, listings } from "@/db/schema";
import type { Env } from "@/lib/env";

const CLEAR = new Set(["passed", "approved"]);

/**
 * A finished listing is `active` only while every photo is verified (passed or approved by an
 * admin). Otherwise it sits in `pending_verification`, which the seller sees under Pending.
 */
export async function recomputeListingStatus(env: Env, db: DB, listingId: string) {
  const listing = (await db.select().from(listings).where(eq(listings.id, listingId)).limit(1))[0];
  if (!listing || (listing.status !== "pending_verification" && listing.status !== "active")) return listing?.status;

  const photos = await db
    .select({ scanStatus: listingPhotos.scanStatus })
    .from(listingPhotos)
    .where(and(eq(listingPhotos.listingId, listingId), eq(listingPhotos.uploadStatus, "uploaded")));
  const allClear = photos.length > 0 && photos.every((p) => CLEAR.has(p.scanStatus));

  if (allClear && listing.status === "pending_verification") {
    await db
      .update(listings)
      .set({ status: "active", publishedAt: listing.publishedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(listings.id, listingId));
    return "active";
  }
  if (!allClear && listing.status === "active") {
    await db.update(listings).set({ status: "pending_verification", updatedAt: new Date() }).where(eq(listings.id, listingId));
    return "pending_verification";
  }
  return listing.status;
}
