import { eq } from "drizzle-orm";
import { listings } from "@/db/schema";
import { fail, json, ownListing, withUser } from "@/lib/api";
import { DetailsSchema } from "@/lib/listings/validate";
import { db } from "@/lib/server";

type Ctx = RouteContext<"/api/listings/[id]">;

/** Saves title/description/tags etc. Used by both the AI and manual paths. */
export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const listing = await ownListing(id, user);
  if (!listing) return fail("Listing not found.", 404);
  const parsed = DetailsSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.");
  await db()
    .update(listings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(listings.id, id));
  return json({ ok: true });
});
