import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { addDays } from "@/lib/dates";
import { mediaUrl } from "@/lib/media";

type RentalRow = {
  id: string;
  status: string;
  start_date: string;
  days: number;
  total_cents: number;
  listing_id: string;
  title: string;
  cover: string | null;
  other_id: string;
  other_name: string | null;
  note: string | null;
};

const rentalQuery = (role: "owner" | "renter", me: string, statuses: string[]) => sql`
  SELECT r.id, r.status, r.start_date, r.days, r.total_cents, r.listing_id, r.note, l.title,
    (SELECT COALESCE(thumb_key, display_key) FROM listing_photos WHERE listing_id = l.id ORDER BY position LIMIT 1) AS cover,
    ${role === "owner" ? sql`r.renter_id` : sql`r.owner_id`} AS other_id,
    (SELECT name FROM users WHERE id = ${role === "owner" ? sql`r.renter_id` : sql`r.owner_id`}) AS other_name
  FROM rentals r JOIN listings l ON l.id = r.listing_id
  WHERE ${role === "owner" ? sql`r.owner_id` : sql`r.renter_id`} = ${me}
    AND r.status IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})
  ORDER BY r.start_date ASC, r.created_at DESC
  LIMIT 100`;

export type RentalCardData = {
  id: string;
  status: string;
  startDate: string;
  dueDate: string;
  days: number;
  totalCents: number;
  listingId: string;
  title: string;
  coverUrl: string | null;
  otherId: string;
  otherName: string | null;
  note: string | null;
};

const toCard = (r: RentalRow): RentalCardData => ({
  id: r.id,
  status: r.status,
  startDate: r.start_date,
  dueDate: addDays(r.start_date, r.days),
  days: r.days,
  totalCents: r.total_cents,
  listingId: r.listing_id,
  title: r.title,
  coverUrl: mediaUrl(r.cover),
  otherId: r.other_id,
  otherName: r.other_name,
  note: r.note,
});

export async function rentalsFor(db: DB, me: string, role: "owner" | "renter", statuses: string[]) {
  return (await db.all<RentalRow>(rentalQuery(role, me, statuses))).map(toCard);
}

export type OwnListing = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  priceCents: number;
  views: number;
  coverUrl: string | null;
  photoStates: string[];
  rentedNow: boolean;
  openRequests: number;
};

export async function ownListings(db: DB, me: string): Promise<OwnListing[]> {
  const rows = await db.all<{
    id: string;
    title: string;
    status: string;
    visibility: string;
    price_cents: number;
    views: number;
    cover: string | null;
    states: string | null;
    rented: number;
    requests: number;
  }>(sql`
    SELECT l.id, l.title, l.status, l.visibility, l.price_cents, l.views,
      (SELECT COALESCE(thumb_key, display_key) FROM listing_photos WHERE listing_id = l.id ORDER BY position LIMIT 1) AS cover,
      (SELECT GROUP_CONCAT(scan_status) FROM listing_photos WHERE listing_id = l.id AND upload_status = 'uploaded') AS states,
      EXISTS (SELECT 1 FROM rentals WHERE listing_id = l.id AND status = 'active') AS rented,
      (SELECT COUNT(*) FROM rentals WHERE listing_id = l.id AND status = 'requested') AS requests
    FROM listings l
    WHERE l.owner_id = ${me} AND l.status != 'removed'
    ORDER BY COALESCE(l.updated_at, l.created_at) DESC`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title || "Untitled listing",
    status: r.status,
    visibility: r.visibility,
    priceCents: r.price_cents,
    views: r.views,
    coverUrl: mediaUrl(r.cover),
    photoStates: r.states ? r.states.split(",") : [],
    rentedNow: !!r.rented,
    openRequests: r.requests,
  }));
}

/** Human summary of where a pending listing's photo checks stand. */
export function pendingSummary(states: string[]): { label: string; tone: "neutral" | "warn" | "danger" } {
  if (states.includes("rejected")) return { label: "Photo rejected. Replace it to go live", tone: "danger" };
  if (states.some((s) => s === "flagged" || s === "quota_hold" || s === "error")) return { label: "Waiting on a quick review", tone: "warn" };
  return { label: "Verifying photos…", tone: "neutral" };
}
