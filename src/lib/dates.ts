// Rentals are booked by calendar day. Dates are stored as YYYY-MM-DD and "today" is evaluated in
// the campus timezone (Central for the launch campus) so reminders and countdowns line up.

export const DEFAULT_TZ = "America/Chicago";

export function todayISO(tz = DEFAULT_TZ, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUTC(value));
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(toUTC(iso)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** "today", "tomorrow", "in 3 days", "2 days ago" */
export function relativeDay(iso: string, today = todayISO()): string {
  const n = diffDays(today, iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** Inclusive-exclusive overlap of two [start, start+days) ranges. */
export function rangesOverlap(aStart: string, aDays: number, bStart: string, bDays: number): boolean {
  const a0 = toUTC(aStart);
  const a1 = a0 + aDays * 86_400_000;
  const b0 = toUTC(bStart);
  const b1 = b0 + bDays * 86_400_000;
  return a0 < b1 && b0 < a1;
}
