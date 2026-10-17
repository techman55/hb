import { inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { settings } from "@/db/schema";

/** Admin-tunable settings with safe defaults. Stored as JSON in the `settings` table. */
export const DEFAULT_SETTINGS = {
  /** Sightengine `ai_generated` score at or above which a photo is held for review. */
  aiThreshold: 0.35,
  /** Kept under Sightengine's free plan (500/day, 2,000/month). */
  sightengineDailyCap: 450,
  sightengineMonthlyCap: 1900,
  /** Days a chat stays open after a rental ends. */
  chatRetentionDays: 7,
};

export type AppSettings = typeof DEFAULT_SETTINGS;

export async function getSettings(db: DB): Promise<AppSettings> {
  const keys = Object.keys(DEFAULT_SETTINGS);
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as AppSettings;
}

export async function saveSettings(db: DB, patch: Partial<AppSettings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value == null) continue;
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}
