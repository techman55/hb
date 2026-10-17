import { asc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { listingPhotos, listings, meetupSpots, rentals, users } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { mediaUrl } from "@/lib/media";

export async function getRentalDetail(db: DB, rentalId: string, me: string) {
  const rental = (await db.select().from(rentals).where(eq(rentals.id, rentalId)).limit(1))[0];
  if (!rental || (rental.renterId !== me && rental.ownerId !== me)) return null;
  const role = rental.ownerId === me ? ("owner" as const) : ("renter" as const);
  const otherId = role === "owner" ? rental.renterId : rental.ownerId;

  const [listing, cover, other] = await Promise.all([
    db.select().from(listings).where(eq(listings.id, rental.listingId)).limit(1),
    db
      .select({ key: listingPhotos.thumbKey, display: listingPhotos.displayKey })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, rental.listingId))
      .orderBy(asc(listingPhotos.position))
      .limit(1),
    db
      .select({ id: users.id, name: users.name, email: users.email, schoolId: users.schoolId, venmo: users.venmo, cashapp: users.cashapp })
      .from(users)
      .where(eq(users.id, otherId))
      .limit(1),
  ]);
  const l = listing[0];
  const spots = await db
    .select({ name: meetupSpots.name, note: meetupSpots.note })
    .from(meetupSpots)
    .where(eq(meetupSpots.schoolId, l?.schoolId ?? ""))
    .orderBy(asc(meetupSpots.position));

  // Never hand the HOTP secret to page code: if it reached a client component, the owner could
  // mint the renter's handoff code and fake a pickup or return.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { handoffSecret, ...safeRental } = rental;
  return {
    rental: safeRental,
    role,
    dueDate: addDays(rental.startDate, rental.days),
    listing: { id: l?.id ?? rental.listingId, title: l?.title ?? "Item", coverUrl: mediaUrl(cover[0]?.key ?? cover[0]?.display) },
    other: other[0] ?? { id: otherId, name: null, email: "", schoolId: "", venmo: null, cashapp: null },
    spots,
  };
}

export type RentalDetail = NonNullable<Awaited<ReturnType<typeof getRentalDetail>>>;

/** Prefilled pay links. Payment itself happens outside Dibs. */
export function payLinks(other: { venmo: string | null; cashapp: string | null }, totalCents: number, title: string) {
  const amount = (totalCents / 100).toFixed(2);
  const links: { label: string; href: string }[] = [];
  if (other.venmo) {
    // Venmo's app shows "+" literally, so spaces must be %20 (encodeURIComponent, not URLSearchParams).
    // Punctuation is dropped so nothing else depends on how Venmo decodes escapes.
    const note = `${title.replace(/[^\p{L}\p{N} -]+/gu, " ").replace(/\s+/g, " ").trim()} rental via Dibs`;
    links.push({
      label: "Pay with Venmo",
      href: `https://venmo.com/${encodeURIComponent(other.venmo)}?txn=pay&audience=private&amount=${amount}&note=${encodeURIComponent(note)}`,
    });
  }
  if (other.cashapp) links.push({ label: "Pay with Cash App", href: `https://cash.app/$${encodeURIComponent(other.cashapp)}/${amount}` });
  return links;
}

/** "Venmo (@x) or Cash App ($y)", or null when the owner hasn't added either. */
export function payHandles(owner: { venmo: string | null; cashapp: string | null }): string | null {
  const apps = [owner.venmo && `Venmo (@${owner.venmo})`, owner.cashapp && `Cash App ($${owner.cashapp})`].filter(Boolean);
  return apps.length ? apps.join(" or ") : null;
}
