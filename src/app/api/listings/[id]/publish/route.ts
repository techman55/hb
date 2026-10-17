import { eq } from "drizzle-orm";
import { listings } from "@/db/schema";
import { moderateText } from "@/lib/ai/listing";
import { fail, json, ownListing, withUser } from "@/lib/api";
import { recomputeListingStatus } from "@/lib/listings/status";
import { DetailsSchema, PublishSchema } from "@/lib/listings/validate";
import { db, env } from "@/lib/server";

type Ctx = RouteContext<"/api/listings/[id]/publish">;

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const listing = await ownListing(id, user);
  if (!listing) return fail("Listing not found.", 404);
  const parsed = PublishSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the price.");

  const details = DetailsSchema.safeParse(listing);
  if (!details.success) return fail("Add a title and details first.");

  const mod = await moderateText(env(), `${listing.title}\n${listing.description}\n${listing.tags.join(", ")}`);
  if (mod.flagged) return fail("This listing looks like it breaks the rules for what can be rented on Dibs.", 422);

  const { visibility, priceCents, maxDays } = parsed.data;
  await db()
    .update(listings)
    .set({
      visibility,
      priceCents,
      maxDays,
      status: listing.status === "drafting" ? "pending_verification" : listing.status,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, id));
  const status = await recomputeListingStatus(env(), db(), id);
  return json({ status, visibility });
});
