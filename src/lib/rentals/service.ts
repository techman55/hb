// Rental lifecycle: requested → accepted → active (picked up) → returned.
// Side exits: declined, cancelled, expired. Payment happens in person, outside the app.

import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { listings, rentals, users, type Rental, type User } from "@/db/schema";
import { addMessage, systemMessage } from "@/lib/chat/service";
import { newId, randomToken } from "@/lib/crypto";
import { addDays, formatDay, isISODate, rangesOverlap, todayISO } from "@/lib/dates";
import { requireSecret, type Env } from "@/lib/env";
import { canView } from "@/lib/listings/queries";
import { notify } from "@/lib/notify";
import { firstName, formatMoney } from "@/lib/utils";
import { verifyHandoff, type HandoffAction } from "./handoff";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const BOOKED = ["accepted", "active"] as const;
export const MAX_ADVANCE_DAYS = 60;

async function getRental(db: DB, id: string) {
  return (await db.select().from(rentals).where(eq(rentals.id, id)).limit(1))[0] ?? null;
}

async function nameOf(db: DB, id: string) {
  return (await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1))[0]?.name ?? null;
}

async function overlaps(db: DB, listingId: string, startDate: string, days: number, excludeId?: string) {
  const booked = await db
    .select()
    .from(rentals)
    .where(
      and(
        eq(rentals.listingId, listingId),
        inArray(rentals.status, [...BOOKED]),
        excludeId ? ne(rentals.id, excludeId) : undefined,
      ),
    );
  return booked.some((r) => rangesOverlap(r.startDate, r.days, startDate, days));
}

export async function requestDibs(
  env: Env,
  db: DB,
  renter: User,
  input: { listingId: string; startDate: string; days: number; note?: string },
): Promise<Result<{ rentalId: string }>> {
  const listing = (await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1))[0];
  if (!listing || !(await canView(db, { id: renter.id, schoolId: renter.schoolId }, listing)) || listing.status !== "active") {
    return { ok: false, error: "This listing isn't available." };
  }
  if (listing.ownerId === renter.id) return { ok: false, error: "That's your own listing." };
  if (!isISODate(input.startDate)) return { ok: false, error: "Pick a start date." };
  const today = todayISO();
  if (input.startDate < today || input.startDate > addDays(today, MAX_ADVANCE_DAYS)) {
    return { ok: false, error: `Pick a date in the next ${MAX_ADVANCE_DAYS} days.` };
  }
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > listing.maxDays) {
    return { ok: false, error: `This one can be rented for up to ${listing.maxDays} days.` };
  }
  const open = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.listingId, listing.id), eq(rentals.renterId, renter.id), inArray(rentals.status, ["requested", "accepted", "active"])))
    .limit(1);
  if (open.length) return { ok: false, error: "You already have dibs on this one. Check My Dibs." };
  if (await overlaps(db, listing.id, input.startDate, input.days)) {
    return { ok: false, error: "Someone already has it for some of those days. Try other dates." };
  }

  const rental: typeof rentals.$inferInsert = {
    id: newId("rnt"),
    listingId: listing.id,
    renterId: renter.id,
    ownerId: listing.ownerId,
    status: "requested",
    startDate: input.startDate,
    days: input.days,
    priceCents: listing.priceCents,
    totalCents: listing.priceCents * input.days,
    note: input.note?.trim().slice(0, 500) || null,
    handoffSecret: randomToken(20),
  };
  await db.insert(rentals).values(rental);

  const when = formatDay(input.startDate);
  await systemMessage(
    env,
    db,
    rental.id!,
    `${firstName(renter.name, "Someone")} called dibs: ${input.days} ${input.days === 1 ? "day" : "days"} from ${when}, ${formatMoney(rental.totalCents!)} total.`,
  );
  if (rental.note) await addMessage(env, db, rental.id!, renter.id, rental.note);
  return { ok: true, rentalId: rental.id! };
}

export async function respondToDibs(env: Env, db: DB, owner: User, rentalId: string, accept: boolean): Promise<Result> {
  const rental = await getRental(db, rentalId);
  if (!rental || rental.ownerId !== owner.id) return { ok: false, error: "Request not found." };
  if (rental.status !== "requested") return { ok: false, error: "This request was already answered." };
  const when = formatDay(rental.startDate);

  if (!accept) {
    await db.update(rentals).set({ status: "declined", respondedAt: new Date(), closedAt: new Date(), closedBy: owner.id }).where(eq(rentals.id, rentalId));
    await systemMessage(env, db, rentalId, `${firstName(owner.name, "The owner")} declined this request.`);
    return { ok: true };
  }

  if (await overlaps(db, rental.listingId, rental.startDate, rental.days, rental.id)) {
    return { ok: false, error: "Those dates overlap a rental you already accepted." };
  }
  await db.update(rentals).set({ status: "accepted", respondedAt: new Date() }).where(eq(rentals.id, rentalId));
  await systemMessage(env, db, rentalId, `${firstName(owner.name, "The owner")} accepted. Pickup is ${when}. Agree on a spot below.`);

  // Other pending requests for overlapping dates can't happen now.
  const competing = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.listingId, rental.listingId), eq(rentals.status, "requested"), ne(rentals.id, rentalId)));
  for (const other of competing.filter((r) => rangesOverlap(r.startDate, r.days, rental.startDate, rental.days))) {
    await db.update(rentals).set({ status: "declined", respondedAt: new Date(), closedAt: new Date(), closedReason: "overlap" }).where(eq(rentals.id, other.id));
    await systemMessage(env, db, other.id, "Those dates were booked by someone else, so this request was closed.");
  }
  return { ok: true };
}

export async function cancelRental(env: Env, db: DB, user: User, rentalId: string): Promise<Result> {
  const rental = await getRental(db, rentalId);
  if (!rental || (rental.renterId !== user.id && rental.ownerId !== user.id)) return { ok: false, error: "Rental not found." };
  if (rental.status !== "requested" && rental.status !== "accepted") {
    return { ok: false, error: rental.status === "active" ? "It's already picked up. Return it to finish." : "This rental is closed." };
  }
  await db.update(rentals).set({ status: "cancelled", closedAt: new Date(), closedBy: user.id }).where(eq(rentals.id, rentalId));
  await systemMessage(env, db, rentalId, `${firstName(user.name, "Someone")} cancelled.`);
  return { ok: true };
}

export function expectedHandoff(rental: Rental): HandoffAction | null {
  if (rental.status === "accepted") return "pickup";
  if (rental.status === "active") return "return";
  return null;
}

/** The owner scans (or types) the renter's code. Moves accepted → active, or active → returned. */
export async function confirmHandoff(env: Env, db: DB, owner: User, rentalId: string, input: string): Promise<Result<{ action: HandoffAction }>> {
  const rental = await getRental(db, rentalId);
  if (!rental || rental.ownerId !== owner.id) return { ok: false, error: "Rental not found." };
  const action = expectedHandoff(rental);
  if (!action) return { ok: false, error: "There's nothing to hand off for this rental." };
  if (action === "pickup" && rental.startDate > addDays(todayISO(), 1)) {
    return { ok: false, error: `Pickup is set for ${formatDay(rental.startDate)}.` };
  }
  const valid = await verifyHandoff({
    input,
    rentalId,
    action,
    handoffSecret: rental.handoffSecret,
    authSecret: requireSecret(env, "AUTH_SECRET"),
  });
  if (!valid) return { ok: false, error: "That code didn't match. Ask them to refresh it and try again." };

  const renterName = firstName(await nameOf(db, rental.renterId), "the renter");
  if (action === "pickup") {
    await db.update(rentals).set({ status: "active", pickedUpAt: new Date() }).where(eq(rentals.id, rentalId));
    const due = formatDay(addDays(rental.startDate, rental.days));
    await systemMessage(env, db, rentalId, `Picked up. Verified in person with ${renterName}. Due back ${due}.`);
    await notify.receipt(env, db, rentalId, "pickup");
  } else {
    await db.update(rentals).set({ status: "returned", returnedAt: new Date(), closedAt: new Date() }).where(eq(rentals.id, rentalId));
    await systemMessage(env, db, rentalId, `Returned. Verified in person with ${renterName}. All done.`);
    await notify.receipt(env, db, rentalId, "return");
  }
  return { ok: true, action };
}

/** Cron: close requests nobody answered and pickups that never happened. */
export async function expireRentals(env: Env, db: DB, now = new Date()) {
  const cutoff = new Date(now.getTime() - 48 * 3_600_000);
  const today = todayISO(undefined, now);
  const stale = await db.select().from(rentals).where(inArray(rentals.status, ["requested", "accepted"]));
  for (const r of stale) {
    const unanswered = r.status === "requested" && (r.createdAt < cutoff || r.startDate < today);
    const noShow = r.status === "accepted" && addDays(r.startDate, 2) < today;
    if (!unanswered && !noShow) continue;
    await db.update(rentals).set({ status: "expired", closedAt: now, closedReason: unanswered ? "unanswered" : "no_pickup" }).where(eq(rentals.id, r.id));
    await systemMessage(env, db, r.id, unanswered ? "This request expired without an answer." : "Pickup didn't happen, so this rental was closed.");
  }
}

/**
 * Cancels requests and not-yet-picked-up rentals when a listing disappears or a user is banned.
 * Items already picked up stay active so they still get returned and verified.
 */
export async function closeOpenRentals(env: Env, db: DB, scope: { listingId?: string; userId?: string }, reason: string) {
  const open = await db.select().from(rentals).where(inArray(rentals.status, ["requested", "accepted"]));
  const hit = open.filter(
    (r) =>
      (scope.listingId && r.listingId === scope.listingId) ||
      (scope.userId && (r.ownerId === scope.userId || r.renterId === scope.userId)),
  );
  for (const r of hit) {
    await db.update(rentals).set({ status: "cancelled", closedAt: new Date(), closedReason: reason }).where(eq(rentals.id, r.id));
    await systemMessage(
      env,
      db,
      r.id,
      reason === "listing_removed" ? "This rental was cancelled because the listing is no longer available." : "This rental was closed by a moderator.",
    );
  }
  return hit.length;
}
