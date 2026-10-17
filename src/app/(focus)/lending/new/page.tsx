import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { listingPhotos, listings } from "@/db/schema";
import { ListingFlow, type FlowInitial } from "@/components/flow/listing-flow";
import { requireUser } from "@/lib/auth/current";
import { mediaUrl } from "@/lib/media";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage({ searchParams }: PageProps<"/lending/new">) {
  const user = await requireUser({ next: "/lending/new" });
  const { id } = await searchParams;

  let initial: FlowInitial = {
    listingId: null,
    photos: [],
    details: null,
    aiGenerated: false,
    brief: "",
    suggested: null,
    visibility: null,
    priceCents: null,
    maxDays: 7,
  };

  if (typeof id === "string") {
    const listing = (await db().select().from(listings).where(eq(listings.id, id)).limit(1))[0];
    if (listing && listing.ownerId === user.id && listing.status === "drafting") {
      const photos = await db()
        .select()
        .from(listingPhotos)
        .where(and(eq(listingPhotos.listingId, id), eq(listingPhotos.uploadStatus, "uploaded")))
        .orderBy(asc(listingPhotos.position));
      initial = {
        listingId: listing.id,
        photos: photos.map((p) => ({ id: p.id, thumbUrl: mediaUrl(p.thumbKey) })),
        details: listing.title
          ? {
              title: listing.title,
              description: listing.description,
              category: listing.category,
              condition: listing.condition,
              tags: listing.tags,
              included: listing.included,
            }
          : null,
        aiGenerated: listing.aiGenerated,
        brief: listing.aiBrief ?? "",
        suggested: listing.recommendedPriceCents ? { cents: listing.recommendedPriceCents, note: listing.priceNote } : null,
        visibility: null,
        priceCents: listing.priceCents || null,
        maxDays: listing.maxDays,
      };
    }
  }

  return <ListingFlow initial={initial} />;
}
