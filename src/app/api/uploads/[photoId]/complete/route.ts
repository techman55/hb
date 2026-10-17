import { eq } from "drizzle-orm";
import { z } from "zod";
import { listingPhotos } from "@/db/schema";
import { fail, json, withUser } from "@/lib/api";
import { imageInfo, writeDerivative, DISPLAY_WIDTH, THUMB_WIDTH } from "@/lib/images";
import { mediaUrl } from "@/lib/media";
import { db, env } from "@/lib/server";
import { sniffFormat } from "@/lib/verify/metadata";
import { derivativeKeys, ownPhoto } from "@/lib/uploads";

type Ctx = RouteContext<"/api/uploads/[photoId]/complete">;

const Body = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1).max(10),
});

/** Completes the multipart upload, checks it's really an image, and writes the public WebP copies. */
export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { photoId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail("Bad upload.");
  const photo = await ownPhoto(db(), photoId, user.id);
  if (!photo || !photo.uploadId) return fail("Upload not found.", 404);
  if (photo.uploadStatus === "uploaded") {
    return json({ id: photo.id, displayUrl: mediaUrl(photo.displayKey), thumbUrl: mediaUrl(photo.thumbKey) });
  }

  const e = env();
  const upload = e.UPLOADS.resumeMultipartUpload(photo.originalKey, photo.uploadId);
  await upload.complete(parsed.data.parts.sort((a, b) => a.partNumber - b.partNumber));

  const head = await e.UPLOADS.get(photo.originalKey, { range: { offset: 0, length: 64 } });
  const format = head ? sniffFormat(new Uint8Array(await head.arrayBuffer())) : "unknown";
  if (format === "unknown" || format === "gif") {
    await e.UPLOADS.delete(photo.originalKey);
    await db().update(listingPhotos).set({ uploadStatus: "failed" }).where(eq(listingPhotos.id, photoId));
    return fail("That file isn't a photo we can use. Try a JPEG or PNG.");
  }

  const keys = derivativeKeys(photo);
  try {
    await Promise.all([
      writeDerivative(e, photo.originalKey, keys.display, DISPLAY_WIDTH),
      writeDerivative(e, photo.originalKey, keys.thumb, THUMB_WIDTH),
    ]);
  } catch (err) {
    console.error("derivatives failed", photoId, err);
    await db().update(listingPhotos).set({ uploadStatus: "failed" }).where(eq(listingPhotos.id, photoId));
    return fail("We couldn't read that photo. Try a JPEG or PNG.");
  }
  const info = await imageInfo(e, photo.originalKey);
  const dims = info && "width" in info ? { width: info.width, height: info.height } : {};

  await db()
    .update(listingPhotos)
    .set({ uploadStatus: "uploaded", displayKey: keys.display, thumbKey: keys.thumb, uploadId: null, ...dims })
    .where(eq(listingPhotos.id, photoId));
  return json({ id: photo.id, displayUrl: mediaUrl(keys.display), thumbUrl: mediaUrl(keys.thumb) });
});
