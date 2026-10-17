import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { listingPhotos, listings, schools } from "@/db/schema";
import { generateListing } from "@/lib/ai/listing";
import { fail, json, ownListing, withUser } from "@/lib/api";
import { analysisJpeg, blobToDataUrl } from "@/lib/images";
import { allow } from "@/lib/rate-limit";
import { db, env } from "@/lib/server";

type Ctx = RouteContext<"/api/listings/[id]/generate">;

const Body = z.object({
  brief: z.string().trim().max(300),
  feedback: z.string().trim().max(400).optional(),
  previous: z
    .object({
      title: z.string().max(120),
      description: z.string().max(800),
      category: z.string().max(40),
      condition: z.string().max(20),
      tags: z.array(z.string().max(40)).max(10),
      included: z.array(z.string().max(60)).max(10),
    })
    .partial()
    .optional(),
});

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const listing = await ownListing(id, user);
  if (!listing) return fail("Listing not found.", 404);
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail("Keep it short.");
  const e = env();
  if (!(await allow(e, "AI_LIMITER", `gen:${user.id}`))) return fail("Give it a minute before trying again.", 429);
  if (!e.OPENAI_API_KEY) return fail("Listing generation isn't set up yet. Enter the details manually.", 503);

  const photos = await db()
    .select()
    .from(listingPhotos)
    .where(and(eq(listingPhotos.listingId, id), eq(listingPhotos.uploadStatus, "uploaded")))
    .orderBy(asc(listingPhotos.position))
    .limit(4);
  if (!photos.length) return fail("Add a photo first.");

  const school = (await db().select().from(schools).where(eq(schools.id, user.schoolId)).limit(1))[0];
  const images = await Promise.all(photos.map(async (p) => blobToDataUrl(await analysisJpeg(e, p.originalKey, 768))));

  try {
    const out = await generateListing(e, {
      brief: parsed.data.brief,
      feedback: parsed.data.feedback,
      previous: parsed.data.previous as Parameters<typeof generateListing>[1]["previous"],
      schoolName: school?.name ?? "a US college",
      images,
    });
    const blocked = out.concerns.filter((c) => !["not_an_item", "photo_mismatch"].includes(c));
    if (blocked.length) {
      return fail("This looks like something that can't be rented on Dibs. If that's wrong, enter the details manually.", 422);
    }
    await db()
      .update(listings)
      .set({
        title: out.title,
        description: out.description,
        category: out.category,
        condition: out.condition,
        tags: out.tags,
        included: out.included,
        recommendedPriceCents: out.suggested_price_per_day_cents,
        priceNote: out.price_note,
        aiGenerated: true,
        aiBrief: parsed.data.brief,
        updatedAt: new Date(),
      })
      .where(eq(listings.id, id));
    return json({ listing: out });
  } catch (err) {
    console.error("generate failed", err);
    return fail("We couldn't write that one. Try again, or enter the details manually.", 502);
  }
});
