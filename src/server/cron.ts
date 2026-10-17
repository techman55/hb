import { getDb } from "@/db";
import { runMaintenance } from "@/lib/jobs";

/** Cron entry (every 15 minutes, see wrangler.jsonc). */
export async function runScheduled(env: CloudflareEnv, now: Date) {
  await runMaintenance(env, getDb(env), now);
}
