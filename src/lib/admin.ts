import "server-only";
import { inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import { auditLog, schoolDirectory } from "@/db/schema";
import { newId } from "@/lib/crypto";
import { domainCandidates, isEduDomain } from "@/lib/schools/domains";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Case-insensitive substring match, with LIKE wildcards in the search text taken literally. */
export function contains(column: AnyColumn, q: string): SQL {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/** First value of a search param, trimmed and bounded. */
export function param(value: string | string[] | undefined, max = 100): string {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, max) ?? "";
}

export async function audit(
  db: DB,
  actorId: string,
  action: string,
  target: string | null,
  detail?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({ id: newId("aud"), actorId, action, target, detail: detail ?? null });
}

/** Accepts what people tend to paste: `https://www.mines.edu/`, `@mines.edu`, `Mines.EDU`. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^.*@/, "")
    .replace(/[/?#:].*$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}

// Consumer mail providers. Mapping one of these to a school would let anyone in.
const PUBLIC_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "126.com",
  "hey.com",
  "fastmail.com",
  "tutanota.com",
]);

export function isPublicMailDomain(domain: string): boolean {
  return domainCandidates(domain).some((d) => PUBLIC_MAIL.has(d)) || /^(yahoo|hotmail|outlook|live)\.[a-z.]+$/.test(domain);
}

// Second-level registries such as `ac.uk` or `edu.au`; provisionSchool would collapse to these.
const SHARED_SUFFIX = /^(ac|co|com|edu|org|net|gov|sch|univ)\.[a-z]{2}$/;

/**
 * provisionSchool keeps only the last two labels of a domain it can't find in the directory.
 * That's right for `.edu`, but `ox.ac.uk` would become `ac.uk` and let in a whole country,
 * so those are only accepted when the directory knows the exact school.
 */
export async function campusDomainProblem(db: DB, domain: string): Promise<string | null> {
  if (!isValidDomain(domain)) return "Enter a domain like mines.edu.";
  if (isPublicMailDomain(domain)) return "That's a public email provider, not a school.";
  if (isEduDomain(domain)) return null;
  const base = domain.split(".").slice(-2).join(".");
  if (!SHARED_SUFFIX.test(base)) return null;
  const listed = await db
    .select({ domain: schoolDirectory.domain })
    .from(schoolDirectory)
    .where(inArray(schoolDirectory.domain, domainCandidates(domain)))
    .limit(1);
  return listed.length && listed[0].domain !== base
    ? null
    : "We can't tell where that school's domain starts. Add a domain the school directory knows.";
}
