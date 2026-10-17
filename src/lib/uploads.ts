import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { listingPhotos, type ListingPhoto } from "@/db/schema";

/** R2 requires every part except the last to be the same size and at least 5 MiB. */
export const PART_SIZE = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTOS = 8;

export async function ownPhoto(db: DB, photoId: string, userId: string): Promise<ListingPhoto | null> {
  const photo = (await db.select().from(listingPhotos).where(eq(listingPhotos.id, photoId)).limit(1))[0];
  return photo && photo.ownerId === userId ? photo : null;
}

export function derivativeKeys(photo: Pick<ListingPhoto, "id" | "listingId">) {
  return {
    display: `listings/${photo.listingId}/${photo.id}-1600.webp`,
    thumb: `listings/${photo.listingId}/${photo.id}-480.webp`,
  };
}
