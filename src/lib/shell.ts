import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { addDays, todayISO } from "@/lib/dates";
import { mediaUrl } from "@/lib/media";

export type Handoff = {
  rentalId: string;
  kind: "pickup" | "return";
  role: "owner" | "renter";
  date: string;
  title: string;
  otherName: string | null;
  coverUrl: string | null;
};

export async function unreadThreads(db: DB, me: string): Promise<number> {
  const rows = await db.all<{ n: number }>(sql`
    SELECT COUNT(DISTINCT m.rental_id) AS n
    FROM messages m
    JOIN rentals r ON r.id = m.rental_id
    LEFT JOIN chat_reads cr ON cr.rental_id = m.rental_id AND cr.user_id = ${me}
    WHERE (r.renter_id = ${me} OR r.owner_id = ${me})
      AND (m.sender_id IS NULL OR m.sender_id != ${me})
      AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)`);
  return rows[0]?.n ?? 0;
}

export async function shellData(db: DB, me: string) {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const [unread, counts, handoffs] = await Promise.all([
    unreadThreads(db, me),
    db.all<{ requests: number; dibs: number; friends: number }>(sql`
      SELECT
        (SELECT COUNT(*) FROM rentals WHERE owner_id = ${me} AND status = 'requested') AS requests,
        (SELECT COUNT(*) FROM rentals WHERE renter_id = ${me} AND (
            (status = 'accepted' AND start_date <= ${tomorrow}) OR
            (status = 'active' AND date(start_date, '+' || days || ' days') <= ${today}))) AS dibs,
        (SELECT COUNT(*) FROM friendships WHERE addressee_id = ${me} AND status = 'pending') AS friends`),
    db.all<{
      id: string;
      status: string;
      start_date: string;
      days: number;
      owner_id: string;
      title: string;
      other_name: string | null;
      cover: string | null;
    }>(sql`
      SELECT r.id, r.status, r.start_date, r.days, r.owner_id, l.title,
             (SELECT name FROM users WHERE id = CASE WHEN r.owner_id = ${me} THEN r.renter_id ELSE r.owner_id END) AS other_name,
             (SELECT COALESCE(thumb_key, display_key) FROM listing_photos WHERE listing_id = l.id ORDER BY position LIMIT 1) AS cover
      FROM rentals r JOIN listings l ON l.id = r.listing_id
      WHERE (r.owner_id = ${me} OR r.renter_id = ${me}) AND r.status IN ('accepted', 'active')
      ORDER BY r.start_date LIMIT 20`),
  ]);

  const upcoming: Handoff[] = handoffs
    .map((r) => ({
      rentalId: r.id,
      kind: (r.status === "accepted" ? "pickup" : "return") as Handoff["kind"],
      role: (r.owner_id === me ? "owner" : "renter") as Handoff["role"],
      date: r.status === "accepted" ? r.start_date : addDays(r.start_date, r.days),
      title: r.title,
      otherName: r.other_name,
      coverUrl: mediaUrl(r.cover),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const c = counts[0] ?? { requests: 0, dibs: 0, friends: 0 };
  return { unread, lending: c.requests, dibs: c.dibs, friendRequests: c.friends, upcoming };
}
