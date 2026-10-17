import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { categoryFollows, listingPhotos, listings, rentals, schools, users, type School } from "@/db/schema";
import { friendIds } from "@/lib/friends";
import { mediaUrl } from "@/lib/media";
import { toPublicSchool, type PublicSchool } from "@/lib/schools/service";
import { milesBetween } from "@/lib/utils";

export const VISIBLE_PHOTO = ["passed", "approved"] as const;

export type ListingCardData = {
  id: string;
  title: string;
  priceCents: number;
  maxDays: number;
  category: string;
  coverUrl: string | null;
  school: PublicSchool;
  otherCampus: boolean;
  distanceMi: number | null;
  owner: { id: string; name: string | null };
  isFriend: boolean;
  publishedAt: number | null;
};

type Row = {
  id: string;
  title: string;
  price_cents: number;
  max_days: number;
  category: string;
  owner_id: string;
  owner_name: string | null;
  school_id: string;
  published_at: number | null;
  views: number;
  cover: string | null;
};

const COVER = sql`(SELECT COALESCE(p.thumb_key, p.display_key) FROM listing_photos p
  WHERE p.listing_id = l.id AND p.scan_status IN ('passed', 'approved') ORDER BY p.position LIMIT 1)`;

export type Viewer = { id: string; schoolId: string };

export type FeedFilters = {
  onlyMyCampus?: boolean;
  category?: string | null;
  query?: string | null;
  ownerId?: string;
  limit?: number;
};

/** Turns user input into a safe FTS5 prefix query: `ti 84` → `"ti"* "84"*` */
export function ftsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return terms.length ? terms.map((t) => `"${t}"*`).join(" ") : null;
}

async function loadSchools(db: DB, ids: string[]) {
  const rows = ids.length ? await db.select().from(schools).where(inArray(schools.id, ids)) : [];
  return new Map(rows.map((s) => [s.id, s]));
}

function toCards(rows: Row[], schoolMap: Map<string, School>, viewer: Viewer, friends: Set<string>): ListingCardData[] {
  const mine = schoolMap.get(viewer.schoolId);
  return rows.flatMap((r) => {
    const s = schoolMap.get(r.school_id);
    if (!s) return [];
    const other = r.school_id !== viewer.schoolId;
    const distance =
      other && mine?.lat != null && mine.lng != null && s.lat != null && s.lng != null
        ? Math.round(milesBetween({ lat: mine.lat, lng: mine.lng }, { lat: s.lat, lng: s.lng }))
        : null;
    return [
      {
        id: r.id,
        title: r.title,
        priceCents: r.price_cents,
        maxDays: r.max_days,
        category: r.category,
        coverUrl: mediaUrl(r.cover),
        school: toPublicSchool(s),
        otherCampus: other,
        distanceMi: distance,
        owner: { id: r.owner_id, name: r.owner_name },
        isFriend: friends.has(r.owner_id),
        publishedAt: r.published_at,
      },
    ];
  });
}

/** Listings this viewer may see, newest first, with optional campus/category/text filters. */
export async function browseListings(db: DB, viewer: Viewer, filters: FeedFilters = {}) {
  const friends = await friendIds(db, viewer.id);
  const friendList = friends.length ? friends : [""];
  const match = filters.query ? ftsQuery(filters.query) : null;

  const where = [
    sql`l.status = 'active'`,
    sql`s.enabled = 1`,
    sql`u.status = 'active'`,
    filters.ownerId ? sql`l.owner_id = ${filters.ownerId}` : sql`l.owner_id != ${viewer.id}`,
    sql`(l.visibility = 'public' OR (l.visibility = 'friends' AND l.owner_id IN (${sql.join(
      friendList.map((f) => sql`${f}`),
      sql`, `,
    )})))`,
  ];
  if (filters.onlyMyCampus) where.push(sql`l.school_id = ${viewer.schoolId}`);
  if (filters.category) where.push(sql`l.category = ${filters.category}`);
  if (match) where.push(sql`l.rowid IN (SELECT rowid FROM listings_fts WHERE listings_fts MATCH ${match})`);

  const order = match
    ? sql`ORDER BY (SELECT bm25(listings_fts) FROM listings_fts WHERE listings_fts.rowid = l.rowid AND listings_fts MATCH ${match}), l.published_at DESC`
    : sql`ORDER BY l.published_at DESC`;

  const rows = await db.all<Row>(sql`
    SELECT l.id, l.title, l.price_cents, l.max_days, l.category, l.owner_id, u.name AS owner_name,
           l.school_id, l.published_at, l.views, ${COVER} AS cover
    FROM listings l
    JOIN schools s ON s.id = l.school_id
    JOIN users u ON u.id = l.owner_id
    WHERE ${sql.join(where, sql` AND `)}
    ${order}
    LIMIT ${filters.limit ?? 60}`);

  const schoolMap = await loadSchools(db, [...new Set([viewer.schoolId, ...rows.map((r) => r.school_id)])]);
  return { cards: toCards(rows, schoolMap, viewer, new Set(friends)), rows, friends: new Set(friends) };
}

/**
 * "For you": a light, explainable ranking. Same campus, categories you follow, friends'
 * listings, freshness and a little popularity.
 */
export async function forYouFeed(db: DB, viewer: Viewer, opts: { onlyMyCampus: boolean; category?: string | null }) {
  const [{ cards, rows, friends }, follows] = await Promise.all([
    browseListings(db, viewer, { onlyMyCampus: opts.onlyMyCampus, category: opts.category, limit: 200 }),
    db.select({ c: categoryFollows.category }).from(categoryFollows).where(eq(categoryFollows.userId, viewer.id)),
  ]);
  const followed = new Set(follows.map((f) => f.c));
  const now = Date.now();
  const score = new Map(
    rows.map((r) => {
      const ageDays = r.published_at ? (now - r.published_at) / 86_400_000 : 30;
      const s =
        (r.school_id === viewer.schoolId ? 3 : 0) +
        (followed.has(r.category) ? 2 : 0) +
        (friends.has(r.owner_id) ? 2 : 0) +
        2 * Math.max(0, 1 - ageDays / 14) +
        Math.min(r.views, 50) / 50;
      return [r.id, s];
    }),
  );
  return cards.sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0)).slice(0, 60);
}

/** "Following": friends' listings plus categories you follow, newest first. */
export async function followingFeed(db: DB, viewer: Viewer, opts: { onlyMyCampus: boolean }) {
  const [{ cards }, follows] = await Promise.all([
    browseListings(db, viewer, { onlyMyCampus: opts.onlyMyCampus, limit: 200 }),
    db.select({ c: categoryFollows.category }).from(categoryFollows).where(eq(categoryFollows.userId, viewer.id)),
  ]);
  const followed = new Set(follows.map((f) => f.c));
  return { cards: cards.filter((c) => c.isFriend || followed.has(c.category)).slice(0, 60), followed: [...followed] };
}

export async function canView(db: DB, viewer: Viewer, listing: { ownerId: string; visibility: string; status: string }) {
  if (listing.ownerId === viewer.id) return true;
  if (listing.status !== "active") return false;
  if (listing.visibility === "public") return true;
  if (listing.visibility === "friends") return (await friendIds(db, viewer.id)).includes(listing.ownerId);
  return false;
}

export async function getListingDetail(db: DB, viewer: Viewer, id: string) {
  const listing = (await db.select().from(listings).where(eq(listings.id, id)).limit(1))[0];
  if (!listing || listing.status === "removed") return null;
  if (!(await canView(db, viewer, listing))) return null;
  const isOwner = listing.ownerId === viewer.id;

  const [photos, owner, schoolRows, booked, mine, friends] = await Promise.all([
    db.select().from(listingPhotos).where(eq(listingPhotos.listingId, id)).orderBy(asc(listingPhotos.position)),
    db.select({ id: users.id, name: users.name, email: users.email, schoolId: users.schoolId }).from(users).where(eq(users.id, listing.ownerId)).limit(1),
    db.select().from(schools).where(inArray(schools.id, [listing.schoolId, viewer.schoolId])),
    db
      .select({ startDate: rentals.startDate, days: rentals.days })
      .from(rentals)
      .where(and(eq(rentals.listingId, id), inArray(rentals.status, ["accepted", "active"]))),
    db
      .select()
      .from(rentals)
      .where(and(eq(rentals.listingId, id), eq(rentals.renterId, viewer.id), inArray(rentals.status, ["requested", "accepted", "active"])))
      .limit(1),
    friendIds(db, viewer.id),
  ]);

  const schoolMap = new Map(schoolRows.map((s) => [s.id, s]));
  const school = schoolMap.get(listing.schoolId)!;
  const mySchool = schoolMap.get(viewer.schoolId);
  const distanceMi =
    listing.schoolId !== viewer.schoolId && mySchool?.lat != null && mySchool.lng != null && school.lat != null && school.lng != null
      ? Math.round(milesBetween({ lat: mySchool.lat, lng: mySchool.lng }, { lat: school.lat, lng: school.lng }))
      : null;

  return {
    listing,
    isOwner,
    photos: photos
      .filter((p) => isOwner || (VISIBLE_PHOTO as readonly string[]).includes(p.scanStatus))
      .map((p) => ({ id: p.id, url: mediaUrl(p.displayKey), thumbUrl: mediaUrl(p.thumbKey ?? p.displayKey), scanStatus: p.scanStatus })),
    owner: owner[0],
    school: toPublicSchool(school),
    otherCampus: listing.schoolId !== viewer.schoolId,
    distanceMi,
    isFriend: friends.includes(listing.ownerId),
    booked,
    myRental: mine[0] ?? null,
  };
}
