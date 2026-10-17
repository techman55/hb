import { eq } from "drizzle-orm";
import { listings } from "@/db/schema";
import { moderateText } from "@/lib/ai/listing";
import { fail, json, ownListing, withUser } from "@/lib/api";
import { DetailsSchema } from "@/lib/listings/validate";
import { db, env } from "@/lib/server";

type Ctx = RouteContext<"/api/listings/[id]">;

/** Saves title/description/tags etc. Used by both the AI and manual paths. */
export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const listing = await ownListing(id, user);
  if (!listing) return fail("Listing not found.", 404);
  const parsed = DetailsSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.");
  // Drafts are checked at publish; edits to a published listing have to pass the same check.
  if (listing.status !== "drafting") {
    const { title, description, tags } = parsed.data;
    const mod = await moderateText(env(), `${title}\n${description}\n${tags.join(", ")}`);
    if (mod.flagged) return fail("This listing looks like it breaks the rules for what can be rented on Dibs.", 422);
  }
  await db()
    .update(listings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(listings.id, id));
  return json({ ok: true });
});
