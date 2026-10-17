// Metered-API counters so we never leave a provider's free tier by accident.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { apiUsage } from "@/db/schema";

export function periods(now = new Date()) {
  const iso = now.toISOString();
  return { day: `day:${iso.slice(0, 10)}`, month: `month:${iso.slice(0, 7)}` };
}

async function bump(db: DB, provider: string, period: string, cap: number, delta: 1 | -1): Promise<boolean> {
  if (delta === -1) {
    await db
      .update(apiUsage)
      .set({ count: sql`MAX(${apiUsage.count} - 1, 0)` })
      .where(and(eq(apiUsage.provider, provider), eq(apiUsage.period, period)));
    return true;
  }
  const res = await db.run(sql`
    INSERT INTO api_usage (provider, period, count) VALUES (${provider}, ${period}, 1)
    ON CONFLICT (provider, period) DO UPDATE SET count = count + 1 WHERE count < ${cap}`);
  return (res.meta.changes ?? 0) > 0;
}

/** Atomically reserves one call against both the daily and monthly caps. */
export async function reserve(db: DB, provider: string, caps: { daily: number; monthly: number }, now = new Date()) {
  const p = periods(now);
  if (!(await bump(db, provider, p.day, caps.daily, 1))) return false;
  if (!(await bump(db, provider, p.month, caps.monthly, 1))) {
    await bump(db, provider, p.day, caps.daily, -1);
    return false;
  }
  return true;
}

/** Gives a reservation back, e.g. when the provider rejected the request (failed calls aren't billed). */
export async function release(db: DB, provider: string, now = new Date()) {
  const p = periods(now);
  await bump(db, provider, p.day, 0, -1);
  await bump(db, provider, p.month, 0, -1);
}

export async function usage(db: DB, provider: string, now = new Date()) {
  const p = periods(now);
  const rows = await db
    .select()
    .from(apiUsage)
    .where(and(eq(apiUsage.provider, provider), inArray(apiUsage.period, [p.day, p.month])));
  return {
    day: rows.find((r) => r.period === p.day)?.count ?? 0,
    month: rows.find((r) => r.period === p.month)?.count ?? 0,
  };
}
