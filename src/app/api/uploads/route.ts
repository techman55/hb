import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { listingPhotos } from "@/db/schema";
import { fail, json, ownListing, withUser } from "@/lib/api";
import { newId } from "@/lib/crypto";
import { db, env } from "@/lib/server";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PART_SIZE } from "@/lib/uploads";

const Body = z.object({
  listingId: z.string().min(4),
  contentType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif)$/),
  size: z.number().int().positive().max(MAX_PHOTO_BYTES),
  source: z.enum(["camera", "upload"]),
});

/** Starts an R2 multipart upload for one photo. The client then PUTs parts and calls /complete. */
export const POST = withUser(async (req, user) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail("Photos must be JPEG, PNG, WebP or HEIC and under 25 MB.");
  const { listingId, contentType, size, source } = parsed.data;

  const listing = await ownListing(listingId, user);
  if (!listing) return fail("Listing not found.", 404);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(listingPhotos)
    .where(and(eq(listingPhotos.listingId, listingId), ne(listingPhotos.uploadStatus, "failed")));
  if (n >= MAX_PHOTOS) return fail(`Up to ${MAX_PHOTOS} photos per listing.`);

  const id = newId("pho");
  const key = `originals/${user.id}/${listingId}/${id}`;
  const upload = await env().UPLOADS.createMultipartUpload(key, { httpMetadata: { contentType } });
  await db().insert(listingPhotos).values({
    id,
    listingId,
    ownerId: user.id,
    position: n,
    source,
    contentType,
    size,
    originalKey: key,
    uploadId: upload.uploadId,
  });
  return json({ photoId: id, partSize: PART_SIZE, parts: Math.ceil(size / PART_SIZE) });
});
