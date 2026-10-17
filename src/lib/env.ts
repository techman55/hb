// Framework-agnostic helpers around the Worker env. Safe to import from worker.ts, cron and the DO.

export type Env = CloudflareEnv;

export function isDev(env: Env): boolean {
  return env.NEXTJS_ENV === "development" || (env.APP_URL ?? "").startsWith("http://");
}

export function appUrl(env: Env, path = "/"): string {
  const base = (env.APP_URL || "https://dibs.school").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Throws a clear error if a required secret is missing, instead of failing deep inside a fetch. */
export function requireSecret(env: Env, name: keyof Env & string): string {
  const value = env[name];
  if (typeof value !== "string" || !value) throw new Error(`Missing secret ${name}. See docs/ENVIRONMENT.md.`);
  return value;
}
