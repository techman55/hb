import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";

/** Bindings and vars for the current request (Next.js side only). */
export function env(): CloudflareEnv {
  return getCloudflareContext().env;
}

export function db() {
  return getDb(env());
}

/** Keep work running after the response is sent. */
export function waitUntil(promise: Promise<unknown>) {
  const guarded = promise.catch((err) => console.error("background task failed", err));
  try {
    getCloudflareContext().ctx.waitUntil(guarded);
  } catch {
    void guarded;
  }
}
