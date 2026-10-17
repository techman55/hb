import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { listingPhotos } from "@/db/schema";
import { fail, json, ownListing, withUser } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { db, env, waitUntil } from "@/lib/server";
import { scanPhotos } from "@/lib/verify/pipeline";

type Ctx = RouteContext<"/api/listings/[id]/photos">;

async function photoState(listingId: string) {
  const rows = await db()
    .select()
    .from(listingPhotos)
    .where(and(eq(listingPhotos.listingId, listingId), eq(listingPhotos.uploadStatus, "uploaded")))
    .orderBy(asc(listingPhotos.position));
  return rows.map((p) => ({
    id: p.id,
    displayUrl: mediaUrl(p.displayKey),
    thumbUrl: mediaUrl(p.thumbKey),
    scanStatus: p.scanStatus,
    scanReason: p.scanReason,
  }));
}

/** Poll target for photo verification status. */
export const GET = withUser<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  if (!(await ownListing(id, user))) return fail("Listing not found.", 404);
  return json({ photos: await photoState(id) });
});

const Body = z.object({ order: z.array(z.string()).min(1).max(8) });

/**
 * Locks in the photo set: saves the order (first = cover), drops photos the seller removed, and
 * starts verification only for photos that haven't been checked yet.
 */
export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  if (!(await ownListing(id, user))) return fail("Listing not found.", 404);
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail("Add at least one photo.");
  const order = parsed.data.order;

  const d = db();
  const owned = await d
    .select({ id: listingPhotos.id, scanStatus: listingPhotos.scanStatus })
    .from(listingPhotos)
    .where(and(eq(listingPhotos.listingId, id), inArray(listingPhotos.id, order), eq(listingPhotos.uploadStatus, "uploaded")));
  if (!owned.length) return fail("Add at least one photo.");

  await Promise.all(order.map((pid, position) => d.update(listingPhotos).set({ position }).where(and(eq(listingPhotos.id, pid), eq(listingPhotos.listingId, id)))));
  await d.delete(listingPhotos).where(and(eq(listingPhotos.listingId, id), notInArray(listingPhotos.id, order)));

  const toScan = owned.filter((p) => p.scanStatus === "none").map((p) => p.id);
  if (toScan.length) {
    await d.update(listingPhotos).set({ scanStatus: "queued" }).where(inArray(listingPhotos.id, toScan));
    waitUntil(scanPhotos(env(), d, toScan));
  }
  return json({ photos: await photoState(id) });
});
