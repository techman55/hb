// Scheduled maintenance (cron every 15 minutes; see worker.ts and wrangler.jsonc).

import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { listingPhotos, listings, loginTokens, rentals, sessions, smsCodes, users } from "@/db/schema";
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

async function names(db: DB, ids: string[]) {
  if (!ids.length) return new Map<string, string | null>();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** One email to each side on the morning of pickup and of return. Nothing else is scheduled. */
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
  const returns = (
    await db
      .select({ r: rentals, title: listings.title })
      .from(rentals)
      .innerJoin(listings, eq(listings.id, rentals.listingId))
      .where(and(eq(rentals.status, "active"), isNull(rentals.returnReminderAt)))
  ).filter(({ r }) => addDays(r.startDate, r.days) === today);

  const who = await names(db, [...new Set([...pickups, ...returns].flatMap(({ r }) => [r.ownerId, r.renterId]))]);
  const remind = async (r: (typeof rentals)["$inferSelect"], title: string, kind: "pickup" | "return") => {
    await notify.reminder(env, db, r.renterId, { title, kind, role: "renter", otherName: who.get(r.ownerId) ?? null, path: `/dibs/${r.id}` });
    await notify.reminder(env, db, r.ownerId, { title, kind, role: "owner", otherName: who.get(r.renterId) ?? null, path: `/lending/rentals/${r.id}` });
  };

  for (const { r, title } of pickups) {
    await remind(r, title, "pickup");
    await db.update(rentals).set({ pickupReminderAt: now }).where(eq(rentals.id, r.id));
  }
  for (const { r, title } of returns) {
    await remind(r, title, "return");
    await db.update(rentals).set({ returnReminderAt: now }).where(eq(rentals.id, r.id));
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
  await step("cleanup", () => cleanup(env, db, now));
}
