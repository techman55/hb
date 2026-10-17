import { fail, json, withUser } from "@/lib/api";
import { db, env } from "@/lib/server";
import { MAX_PHOTO_BYTES, ownPhoto, PART_SIZE } from "@/lib/uploads";

type Ctx = RouteContext<"/api/uploads/[photoId]/parts/[n]">;

export const PUT = withUser<Ctx>(async (req, user, { params }) => {
  const { photoId, n } = await params;
  const partNumber = Number(n);
  const photo = await ownPhoto(db(), photoId, user.id);
  if (!photo || !photo.uploadId || photo.uploadStatus !== "uploading") return fail("Upload not found.", 404);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > Math.ceil(MAX_PHOTO_BYTES / PART_SIZE)) {
    return fail("Bad part number.");
  }
  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > PART_SIZE) return fail("Bad part size.");

  const upload = env().UPLOADS.resumeMultipartUpload(photo.originalKey, photo.uploadId);
  const part = await upload.uploadPart(partNumber, body);
  return json({ partNumber: part.partNumber, etag: part.etag });
});
