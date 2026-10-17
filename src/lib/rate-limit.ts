import type { Env } from "@/lib/env";

type Limiter = "AUTH_LIMITER" | "AI_LIMITER";

/** Cloudflare rate-limit binding. Fails open if the binding is unavailable (e.g. some local setups). */
export async function allow(env: Env, limiter: Limiter, key: string): Promise<boolean> {
  const binding = env[limiter] as RateLimit | undefined;
  if (!binding) return true;
  try {
    const { success } = await binding.limit({ key });
    return success;
  } catch {
    return true;
  }
}
