import { eq } from "drizzle-orm";
import { listingPhotos } from "@/db/schema";
import { fail, json, withUser } from "@/lib/api";
import { recomputeListingStatus } from "@/lib/listings/status";
import { db, env } from "@/lib/server";
import { ownPhoto } from "@/lib/uploads";

type Ctx = RouteContext<"/api/uploads/[photoId]">;

/** Removes a photo (and aborts its upload if it was still in flight). */
export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  const { photoId } = await params;
  const photo = await ownPhoto(db(), photoId, user.id);
  if (!photo) return fail("Photo not found.", 404);
  const e = env();
  if (photo.uploadId) {
    try {
      await e.UPLOADS.resumeMultipartUpload(photo.originalKey, photo.uploadId).abort();
    } catch {
      /* already completed or aborted */
    }
  }
  await Promise.all([
    e.UPLOADS.delete(photo.originalKey),
    ...[photo.displayKey, photo.thumbKey].filter((k): k is string => !!k).map((k) => e.MEDIA.delete(k)),
  ]);
  await db().delete(listingPhotos).where(eq(listingPhotos.id, photoId));
  await recomputeListingStatus(e, db(), photo.listingId);
  return json({ ok: true });
});
