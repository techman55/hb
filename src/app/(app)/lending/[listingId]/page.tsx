import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { listingPhotos, listings } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { mediaUrl } from "@/lib/media";
import { db } from "@/lib/server";
import { ManageListing } from "./manage";

export const metadata: Metadata = { title: "Manage listing" };

export default async function ManageListingPage({ params }: PageProps<"/lending/[listingId]">) {
  const { listingId } = await params;
  const user = await requireUser();
  const listing = (await db().select().from(listings).where(eq(listings.id, listingId)).limit(1))[0];
  if (!listing || listing.ownerId !== user.id || listing.status === "removed") notFound();
  if (listing.status === "drafting") redirect(`/lending/new?id=${listing.id}`);

  const photos = await db()
    .select()
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId))
    .orderBy(asc(listingPhotos.position));

  return (
    <ManageListing
      listing={{
        id: listing.id,
        status: listing.status,
        visibility: listing.visibility,
        priceCents: listing.priceCents,
        maxDays: listing.maxDays,
        details: {
          title: listing.title,
          description: listing.description,
          category: listing.category,
          condition: listing.condition,
          tags: listing.tags,
          included: listing.included,
        },
      }}
      photos={photos
        .filter((p) => p.uploadStatus === "uploaded")
        .map((p) => ({ id: p.id, url: mediaUrl(p.thumbKey ?? p.displayKey), scanStatus: p.scanStatus, reason: p.scanReason, note: p.reviewNote }))}
    />
  );
}
