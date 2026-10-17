import { eq } from "drizzle-orm";
import { rentals } from "@/db/schema";
import { fail, json, withUser } from "@/lib/api";
import { requireSecret } from "@/lib/env";
import { numericCode, qrPayload, STEP_SECONDS } from "@/lib/rentals/handoff";
import { expectedHandoff } from "@/lib/rentals/service";
import { db, env } from "@/lib/server";

type Ctx = RouteContext<"/api/rentals/[id]/code">;

/** The renter's current handoff code. Fetched again every ~25s while the code screen is open. */
export const GET = withUser<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  const rental = (await db().select().from(rentals).where(eq(rentals.id, id)).limit(1))[0];
  if (!rental || rental.renterId !== user.id) return fail("Rental not found.", 404);
  const action = expectedHandoff(rental);
  if (!action) return json({ action: null, status: rental.status });

  const now = Date.now();
  const secondsLeft = STEP_SECONDS - (Math.floor(now / 1000) % STEP_SECONDS);
  return json({
    action,
    status: rental.status,
    qr: await qrPayload(requireSecret(env(), "AUTH_SECRET"), rental.id, action, now),
    code: await numericCode(rental.handoffSecret, action, now),
    refreshIn: secondsLeft,
  });
});
