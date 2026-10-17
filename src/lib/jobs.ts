// Scheduled maintenance (cron every 15 minutes; see worker.ts and wrangler.jsonc).

import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { listingPhotos, listings, loginTokens, rentals, sessions, smsCodes } from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import type { Env } from "@/lib/env";
import { notify } from "@/lib/notify";
import { expireRentals } from "@/lib/rentals/service";
import { sweepScans } from "@/lib/verify/pipeline";

async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(`cron ${name} failed`, err);
  }
}

async function sendReminders(env: Env, db: DB, now: Date) {
  const today = todayISO(undefined, now);
  // Morning-ish only, so nobody gets a "today" email at 11pm.
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(now));
  if (hour < 8 || hour > 20) return;

  const pickups = await db
    .select({ r: rentals, title: listings.title })
    .from(rentals)
    .innerJoin(listings, eq(listings.id, rentals.listingId))
    .where(and(eq(rentals.status, "accepted"), eq(rentals.startDate, today), isNull(rentals.pickupReminderAt)));
  for (const { r, title } of pickups) {
    await notify.reminder(env, db, r.renterId, { title, kind: "pickup", path: `/dibs/${r.id}` });
    await notify.reminder(env, db, r.ownerId, { title, kind: "pickup", path: `/lending/rentals/${r.id}` });
    await db.update(rentals).set({ pickupReminderAt: now }).where(eq(rentals.id, r.id));
  }

  const active = await db
    .select({ r: rentals, title: listings.title })
    .from(rentals)
    .innerJoin(listings, eq(listings.id, rentals.listingId))
    .where(and(eq(rentals.status, "active"), isNull(rentals.returnReminderAt)));
  for (const { r, title } of active.filter(({ r }) => addDays(r.startDate, r.days) === today)) {
    await notify.reminder(env, db, r.renterId, { title, kind: "return", path: `/dibs/${r.id}` });
    await notify.reminder(env, db, r.ownerId, { title, kind: "return", path: `/lending/rentals/${r.id}` });
    await db.update(rentals).set({ returnReminderAt: now }).where(eq(rentals.id, r.id));
  }
}

/** At most one email per thread per hour, only for messages unread for 10+ minutes. */
async function emailUnread(env: Env, db: DB, now: Date) {
  const tenMin = now.getTime() - 10 * 60_000;
  const hour = now.getTime() - 60 * 60_000;
  const rows = await db.all<{ rental_id: string; user_id: string; title: string; body: string }>(sql`
    SELECT r.id AS rental_id, u.id AS user_id, l.title,
      (SELECT body FROM messages WHERE rental_id = r.id AND sender_id IS NOT NULL AND sender_id != u.id ORDER BY created_at DESC LIMIT 1) AS body
    FROM rentals r
    JOIN listings l ON l.id = r.listing_id
    JOIN users u ON u.id IN (r.owner_id, r.renter_id)
    LEFT JOIN chat_reads cr ON cr.rental_id = r.id AND cr.user_id = u.id
    WHERE r.status IN ('requested', 'accepted', 'active')
      AND EXISTS (SELECT 1 FROM messages m WHERE m.rental_id = r.id AND m.sender_id IS NOT NULL AND m.sender_id != u.id
                  AND m.created_at < ${tenMin} AND m.created_at > COALESCE(cr.last_read_at, 0))
      AND COALESCE(cr.last_emailed_at, 0) < ${hour}
    LIMIT 50`);
  for (const row of rows) {
    if (!row.body) continue;
    await notify.unreadMessages(env, db, row.user_id, { title: row.title, path: `/inbox/${row.rental_id}`, preview: row.body.slice(0, 140) });
    await db.run(sql`
      INSERT INTO chat_reads (rental_id, user_id, last_emailed_at) VALUES (${row.rental_id}, ${row.user_id}, ${now.getTime()})
      ON CONFLICT (rental_id, user_id) DO UPDATE SET last_emailed_at = ${now.getTime()}`);
  }
}

async function cleanup(env: Env, db: DB, now: Date) {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, new Date(now.getTime() - 86_400_000)));
  await db.delete(smsCodes).where(lt(smsCodes.expiresAt, new Date(now.getTime() - 86_400_000)));

  // Drafts abandoned for a week: remove their photos from R2, then the rows.
  const abandoned = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.status, "drafting"), lt(listings.createdAt, new Date(now.getTime() - 7 * 86_400_000))))
    .limit(25);
  if (!abandoned.length) return;
  const ids = abandoned.map((l) => l.id);
  const photos = await db.select().from(listingPhotos).where(inArray(listingPhotos.listingId, ids));
  for (const p of photos) {
    await env.UPLOADS.delete(p.originalKey);
    for (const k of [p.displayKey, p.thumbKey]) if (k) await env.MEDIA.delete(k);
  }
  await db.delete(listingPhotos).where(inArray(listingPhotos.listingId, ids));
  await db.delete(listings).where(inArray(listings.id, ids));
}

export async function runMaintenance(env: Env, db: DB, now: Date) {
  await step("expire rentals", () => expireRentals(env, db, now));
  await step("scan sweep", () => sweepScans(env, db, now));
  await step("reminders", () => sendReminders(env, db, now));
  await step("unread emails", () => emailUnread(env, db, now));
  await step("cleanup", () => cleanup(env, db, now));
}
