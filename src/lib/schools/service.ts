import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { emailOverrides, schoolDirectory, schoolDomains, schools, type School } from "@/db/schema";
import { newId } from "@/lib/crypto";
import type { Env } from "@/lib/env";
import { mediaUrl } from "@/lib/media";
import {
  acronym,
  baseEduDomain,
  domainCandidates,
  emailDomain,
  isEduDomain,
  isValidEmail,
  nameFromDomain,
  normalizeEmail,
  slugFromDomain,
} from "./domains";
import { discoverSchoolFacts, storeLogo } from "./logo";

export type AccessDenied = "invalid" | "not_edu" | "blocked" | "disabled";
export type AccessResult =
  | { ok: true; school: School; via: "override" | "domain" | "provisioned" }
  | { ok: false; reason: AccessDenied };

export type PublicSchool = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  accent: string | null;
};

export function toPublicSchool(s: School): PublicSchool {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    shortName: s.shortName || acronym(s.name),
    logoUrl: s.logoKey ? mediaUrl(s.logoKey) : null,
    accent: s.accent,
  };
}

async function findDomainRow(db: DB, domain: string) {
  const candidates = domainCandidates(domain);
  const rows = await db.select().from(schoolDomains).where(inArray(schoolDomains.domain, candidates));
  // Most specific match wins, so `alumni.ua.edu` can be blocked while `ua.edu` is allowed.
  for (const c of candidates) {
    const hit = rows.find((r) => r.domain === c);
    if (hit) return hit;
  }
  return null;
}

async function findDirectoryEntry(db: DB, domain: string) {
  const candidates = domainCandidates(domain);
  const rows = await db.select().from(schoolDirectory).where(inArray(schoolDirectory.domain, candidates));
  for (const c of candidates) {
    const hit = rows.find((r) => r.domain === c);
    if (hit) return hit;
  }
  return null;
}

async function getSchool(db: DB, id: string) {
  return (await db.select().from(schools).where(eq(schools.id, id)).limit(1))[0] ?? null;
}

async function uniqueSlug(db: DB, base: string) {
  const root = base || "campus";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await db.select({ id: schools.id }).from(schools).where(eq(schools.slug, slug)).limit(1);
    if (!taken.length) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Creates a campus for an .edu domain. Idempotent: concurrent calls converge on one school. */
export async function provisionSchool(db: DB, domain: string, opts: { name?: string; createdBy?: string } = {}) {
  const directory = await findDirectoryEntry(db, domain);
  const base = directory?.domain ?? (isEduDomain(domain) ? baseEduDomain(domain) : domain);
  const existing = await findDomainRow(db, base);
  if (existing?.schoolId) return (await getSchool(db, existing.schoolId))!;

  const name = opts.name ?? directory?.name ?? nameFromDomain(base);
  const school: typeof schools.$inferInsert = {
    id: newId("sch"),
    slug: await uniqueSlug(db, slugFromDomain(base)),
    name,
    shortName: acronym(name),
    primaryDomain: base,
    autoProvisioned: !opts.createdBy,
  };
  await db.insert(schools).values(school);
  await db
    .insert(schoolDomains)
    .values({ domain: base, schoolId: school.id, kind: "edu", createdBy: opts.createdBy ?? null })
    .onConflictDoNothing();

  // Another request may have won the race for the domain row; use whichever school it points at.
  const winner = await findDomainRow(db, base);
  if (winner?.schoolId && winner.schoolId !== school.id) {
    await db.delete(schools).where(eq(schools.id, school.id));
    return (await getSchool(db, winner.schoolId))!;
  }
  return (await getSchool(db, school.id))!;
}

/** Pulls logo, coordinates and colour from the web. Safe to run in the background. */
export async function refreshSchoolFacts(env: Env, db: DB, schoolId: string, opts: { force?: boolean } = {}) {
  const school = await getSchool(db, schoolId);
  if (!school) return null;
  if (!opts.force && school.logoSource) return school;
  const facts = await discoverSchoolFacts(school.primaryDomain);
  const patch: Partial<typeof schools.$inferInsert> = { logoSource: facts.logo?.source ?? "none" };
  if (facts.logo) patch.logoKey = await storeLogo(env, school.slug, facts.logo);
  if (facts.lat != null && school.lat == null) patch.lat = facts.lat;
  if (facts.lng != null && school.lng == null) patch.lng = facts.lng;
  if (facts.accent && !school.accent) patch.accent = facts.accent;
  await db.update(schools).set(patch).where(eq(schools.id, schoolId));
  return getSchool(db, schoolId);
}

/** The single source of truth for "may this email sign in, and as which school?" */
export async function resolveEmailAccess(db: DB, rawEmail: string): Promise<AccessResult> {
  const email = normalizeEmail(rawEmail);
  const domain = emailDomain(email);
  if (!isValidEmail(email) || !domain) return { ok: false, reason: "invalid" };

  const override = (await db.select().from(emailOverrides).where(eq(emailOverrides.email, email)).limit(1))[0];
  if (override) {
    const school = await getSchool(db, override.schoolId);
    if (school?.enabled) return { ok: true, school, via: "override" };
  }

  const row = await findDomainRow(db, domain);
  if (row?.kind === "blocked") return { ok: false, reason: "blocked" };
  if (row?.schoolId) {
    const school = await getSchool(db, row.schoolId);
    if (!school) return { ok: false, reason: "invalid" };
    if (!school.enabled) return { ok: false, reason: "disabled" };
    return { ok: true, school, via: "domain" };
  }

  if (isEduDomain(domain)) {
    const school = await provisionSchool(db, domain);
    return school.enabled ? { ok: true, school, via: "provisioned" } : { ok: false, reason: "disabled" };
  }
  return { ok: false, reason: "not_edu" };
}

export type LoginLookup =
  | { status: "incomplete" }
  | { status: "supported"; school: PublicSchool; logoPending: boolean }
  | { status: "new"; name: string }
  | { status: "unsupported" | "blocked" | "disabled" };

/**
 * Powers the school autofill on the login screen. Known directory schools are provisioned on
 * the spot so their logo is ready by the time the magic link is clicked; unknown .edu domains
 * are only created on a verified sign-in.
 */
export async function lookupForLogin(db: DB, rawEmail: string): Promise<LoginLookup> {
  const email = normalizeEmail(rawEmail);
  const domain = emailDomain(email);
  if (!domain || !isValidEmail(email)) return { status: "incomplete" };

  const override = (await db.select().from(emailOverrides).where(eq(emailOverrides.email, email)).limit(1))[0];
  let school: School | null = override ? await getSchool(db, override.schoolId) : null;

  if (!school) {
    const row = await findDomainRow(db, domain);
    if (row?.kind === "blocked") return { status: "blocked" };
    if (row?.schoolId) school = await getSchool(db, row.schoolId);
  }
  if (!school && isEduDomain(domain)) {
    const directory = await findDirectoryEntry(db, domain);
    if (!directory) return { status: "new", name: nameFromDomain(domain) };
    school = await provisionSchool(db, domain);
  }
  if (!school) return { status: "unsupported" };
  if (!school.enabled) return { status: "disabled" };
  return { status: "supported", school: toPublicSchool(school), logoPending: !school.logoSource };
}
