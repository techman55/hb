import { and, eq, gt } from "drizzle-orm";
import { listings } from "@/db/schema";
import { json, withUser } from "@/lib/api";
import { newId } from "@/lib/crypto";
import { db } from "@/lib/server";

/** Starts a draft listing. Called lazily when the first photo is kept, so abandoned flows cost nothing. */
export const POST = withUser(async (_req, user) => {
  // Throttle runaway drafts: at most 20 created in the last hour.
  const recent = await db()
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.ownerId, user.id), eq(listings.status, "drafting"), gt(listings.createdAt, new Date(Date.now() - 3_600_000))));
  if (recent.length >= 20) return json({ error: "Too many drafts. Finish one first." }, 429);

  const id = newId("lst");
  await db().insert(listings).values({ id, ownerId: user.id, schoolId: user.schoolId, status: "drafting" });
  return json({ id });
});
