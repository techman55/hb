"use server";

// Every action re-checks admin access: server actions are public POST endpoints, and the admin
// layout's guard doesn't run for them.

import { revalidatePath } from "next/cache";
import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import {
  accessAppeals,
  emailOverrides,
  listingPhotos,
  listings,
  meetupSpots,
  schoolDomains,
  schools,
  sessions,
  users,
} from "@/db/schema";
import { audit, campusDomainProblem, isPublicMailDomain, isValidDomain, normalizeDomain, type ActionResult } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/current";
import { newId } from "@/lib/crypto";
import { adminEmails } from "@/lib/env";
import { recomputeListingStatus } from "@/lib/listings/status";
import { closeOpenRentals } from "@/lib/rentals/service";
import { notify } from "@/lib/notify";
import { domainCandidates, emailDomain } from "@/lib/schools/domains";
import { storeLogo } from "@/lib/schools/logo";
import { provisionSchool, refreshSchoolFacts } from "@/lib/schools/service";
import { db, env, waitUntil } from "@/lib/server";
import { saveSettings } from "@/lib/settings";
import { sniffFormat } from "@/lib/verify/metadata";
import { scanPhoto } from "@/lib/verify/pipeline";

const fail = (error: string): ActionResult => ({ ok: false, error });

/** Admin pages read live data; `app` also refreshes the student-facing pages a change shows up on. */
function refresh(app = false) {
  revalidatePath("/admin", "layout");
  if (app) revalidatePath("/", "layout");
}

const field = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v.trim() : "";
};

const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Check the form and try again.";

// ── Photo review ─────────────────────────────────────────────────

async function getPhoto(id: string) {
  return (await db().select().from(listingPhotos).where(eq(listingPhotos.id, id)).limit(1))[0];
}

export async function approvePhoto(photoId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const photo = await getPhoto(photoId);
  if (!photo) return fail("That photo no longer exists.");
  await d
    .update(listingPhotos)
    .set({ scanStatus: "approved", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: null })
    .where(eq(listingPhotos.id, photoId));
  // Emails the owner if this was the last photo holding the listing back.
  const status = await recomputeListingStatus(env(), d, photo.listingId);
  await audit(d, admin.id, "photo.approve", photoId, { listingId: photo.listingId, was: photo.scanStatus });
  refresh(true);
  return { ok: true, message: status === "active" ? "Approved. The listing is live." : "Approved." };
}

export async function rejectPhoto(photoId: string, note: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const photo = await getPhoto(photoId);
  if (!photo) return fail("That photo no longer exists.");
  const reviewNote = note.trim().slice(0, 500) || null;
  await d
    .update(listingPhotos)
    .set({ scanStatus: "rejected", reviewNote, reviewedBy: admin.id, reviewedAt: new Date() })
    .where(eq(listingPhotos.id, photoId));
  await recomputeListingStatus(env(), d, photo.listingId);
  const listing = (await d.select().from(listings).where(eq(listings.id, photo.listingId)).limit(1))[0];
  if (listing && listing.status !== "removed") {
    waitUntil(notify.photoRejected(env(), d, listing.ownerId, listing, reviewNote));
  }
  await audit(d, admin.id, "photo.reject", photoId, { listingId: photo.listingId, was: photo.scanStatus, note: reviewNote });
  refresh(true);
  return { ok: true, message: "Rejected. The owner was asked for a new photo." };
}

export async function rerunPhotoCheck(photoId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const photo = await getPhoto(photoId);
  if (!photo) return fail("That photo no longer exists.");
  if (photo.uploadStatus !== "uploaded") return fail("That photo never finished uploading.");
  if (photo.scanStatus === "queued" || photo.scanStatus === "scanning") return fail("Checks are already running.");
  // A fresh attempt count so a manual re-run gets the pipeline's full retry budget.
  const report = { ...(photo.scanReport ?? {}), attempts: 0 };
  await d
    .update(listingPhotos)
    .set({ scanStatus: "queued", scanReport: report, reviewedBy: null, reviewedAt: null, reviewNote: null })
    .where(eq(listingPhotos.id, photoId));
  await recomputeListingStatus(env(), d, photo.listingId);
  waitUntil(scanPhoto(env(), db(), photoId));
  await audit(d, admin.id, "photo.rescan", photoId, { listingId: photo.listingId, was: photo.scanStatus });
  refresh(true);
  return { ok: true, message: "Checks are running again. Refresh in a few seconds." };
}

// ── Access appeals ───────────────────────────────────────────────

const ApproveInput = z.object({
  schoolId: z.string().max(40).optional(),
  newDomain: z.string().max(253).optional(),
  addDomain: z.boolean(),
  note: z.string().max(500).optional(),
});

/** Proof photos (student IDs) are only needed until the decision; don't keep them around. */
async function dropEvidence(appealId: string, key: string | null) {
  if (!key) return;
  await env().UPLOADS.delete(key);
  await db().update(accessAppeals).set({ evidenceKey: null }).where(eq(accessAppeals.id, appealId));
}

export async function approveAppeal(appealId: string, raw: z.input<typeof ApproveInput>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = ApproveInput.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const d = db();
  const e = env();

  const appeal = (await d.select().from(accessAppeals).where(eq(accessAppeals.id, appealId)).limit(1))[0];
  if (!appeal) return fail("That request no longer exists.");
  if (appeal.status !== "pending") return fail("This request was already decided.");

  const domain = input.addDomain ? emailDomain(appeal.email) : null;
  if (input.addDomain) {
    if (!domain) return fail("That email has no usable domain.");
    if (isPublicMailDomain(domain)) return fail(`@${domain} is a public email provider. Approve just this address instead.`);
  }

  let school: typeof schools.$inferSelect | undefined;
  if (input.newDomain) {
    const campus = normalizeDomain(input.newDomain);
    const problem = await campusDomainProblem(d, campus);
    if (problem) return fail(problem);
    school = await provisionSchool(d, campus, { createdBy: admin.id });
    waitUntil(refreshSchoolFacts(e, d, school.id, { force: true }));
  } else if (input.schoolId) {
    school = (await d.select().from(schools).where(eq(schools.id, input.schoolId)).limit(1))[0];
  }
  if (!school) return fail("Pick the school this person belongs to.");

  const existingDomain = domain
    ? (await d.select().from(schoolDomains).where(eq(schoolDomains.domain, domain)).limit(1))[0]
    : undefined;
  const adminNote = input.note?.trim() || null;
  const now = new Date();

  await d.batch([
    d
      .insert(emailOverrides)
      .values({ email: appeal.email, schoolId: school.id, note: `Appeal ${appeal.id}`, createdBy: admin.id })
      .onConflictDoUpdate({ target: emailOverrides.email, set: { schoolId: school.id, note: `Appeal ${appeal.id}`, createdBy: admin.id } }),
    ...(domain && !existingDomain
      ? [
          d.insert(schoolDomains).values({
            domain,
            schoolId: school.id,
            kind: "exception" as const,
            note: `From ${appeal.email}'s appeal`,
            createdBy: admin.id,
          }),
        ]
      : []),
    d
      .update(accessAppeals)
      .set({ status: "approved", schoolId: school.id, adminNote, reviewedBy: admin.id, reviewedAt: now })
      .where(and(eq(accessAppeals.id, appeal.id), eq(accessAppeals.status, "pending"))),
  ]);

  waitUntil(notify.appealDecision(e, appeal.email, true));
  await dropEvidence(appeal.id, appeal.evidenceKey);
  await audit(d, admin.id, "appeal.approve", appeal.id, {
    email: appeal.email,
    schoolId: school.id,
    domain: domain && !existingDomain ? domain : null,
  });
  refresh();

  const domainMessage = !domain
    ? ""
    : existingDomain
      ? ` @${domain} was already listed as ${existingDomain.kind}, so it was left alone.`
      : ` Everyone at @${domain} can sign in now.`;
  const offMessage = school.enabled ? "" : " The school is turned off, so they can't sign in until you turn it on.";
  return { ok: true, message: `Approved for ${school.name}.${domainMessage}${offMessage}` };
}

export async function denyAppeal(appealId: string, note: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const adminNote = note.trim().slice(0, 500) || null;
  const res = await d
    .update(accessAppeals)
    .set({ status: "denied", adminNote, reviewedBy: admin.id, reviewedAt: new Date() })
    .where(and(eq(accessAppeals.id, appealId), eq(accessAppeals.status, "pending")))
    .returning({ email: accessAppeals.email, evidenceKey: accessAppeals.evidenceKey });
  if (!res.length) return fail("This request was already decided.");
  await dropEvidence(appealId, res[0].evidenceKey);
  waitUntil(notify.appealDecision(env(), res[0].email, false, adminNote));
  await audit(d, admin.id, "appeal.deny", appealId, { email: res[0].email, note: adminNote });
  refresh();
  return { ok: true, message: "Denied. We emailed them." };
}

// ── Domains ──────────────────────────────────────────────────────

export async function addDomain(data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const kind = field(data, "kind") === "blocked" ? "blocked" : "exception";
  const domain = normalizeDomain(field(data, "domain"));
  if (!isValidDomain(domain)) return fail("Enter a domain like college.org.");
  const note = field(data, "note").slice(0, 200) || null;

  let schoolId: string | null = null;
  if (kind === "exception") {
    if (isPublicMailDomain(domain)) return fail("That's a public email provider. Approve people one by one through appeals.");
    const school = (await d.select({ id: schools.id }).from(schools).where(eq(schools.id, field(data, "schoolId"))).limit(1))[0];
    if (!school) return fail("Pick the school this domain belongs to.");
    schoolId = school.id;
  }

  const existing = (await d.select().from(schoolDomains).where(eq(schoolDomains.domain, domain)).limit(1))[0];
  if (existing) return fail(`${domain} is already listed as ${existing.kind}. Remove it first to change it.`);

  await d.insert(schoolDomains).values({ domain, schoolId, kind, note, createdBy: admin.id });
  await audit(d, admin.id, `domain.${kind}`, domain, { schoolId, note });
  refresh();
  return { ok: true, message: kind === "blocked" ? `${domain} is blocked.` : `${domain} can sign in now.` };
}

export async function deleteDomain(domain: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const row = (await d.select().from(schoolDomains).where(eq(schoolDomains.domain, domain)).limit(1))[0];
  if (!row) return fail("That domain isn't listed.");
  // A school's own domain rows come back on the next .edu sign-in, so removing them wouldn't stick.
  if (row.kind === "edu") return fail("A school's own domain can't be removed. Block a subdomain or turn the school off instead.");
  await d.delete(schoolDomains).where(eq(schoolDomains.domain, domain));
  await audit(d, admin.id, "domain.delete", domain, { kind: row.kind, schoolId: row.schoolId });
  refresh();
  return { ok: true, message: `Removed ${domain}.` };
}

// ── Schools ──────────────────────────────────────────────────────

export async function addCampus(data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const domain = normalizeDomain(field(data, "domain"));
  const problem = await campusDomainProblem(d, domain);
  if (problem) return fail(problem);

  const known = await d.select().from(schoolDomains).where(inArray(schoolDomains.domain, domainCandidates(domain)));
  const existed = known.some((r) => r.schoolId);
  const school = await provisionSchool(d, domain, { createdBy: admin.id });
  if (!existed) waitUntil(refreshSchoolFacts(env(), d, school.id, { force: true }));
  await audit(d, admin.id, "school.add", school.id, { domain, existed });
  refresh(true);
  return {
    ok: true,
    message: existed ? `${school.name} was already set up.` : `Added ${school.name}. Its logo will show up in a moment.`,
  };
}

const SchoolInput = z.object({
  name: z.string().trim().min(2, "Give the school a name.").max(120, "That name is too long."),
  shortName: z.string().trim().max(16, "Keep the short name under 16 characters."),
  accent: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6})?$/, "Colors look like #9E1B32."),
  enabled: z.boolean(),
});

export async function updateSchool(schoolId: string, data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = SchoolInput.safeParse({
    name: field(data, "name"),
    shortName: field(data, "shortName"),
    accent: field(data, "accent"),
    enabled: data.get("enabled") === "on",
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = db();
  const patch = {
    name: parsed.data.name,
    shortName: parsed.data.shortName || null,
    accent: parsed.data.accent ? parsed.data.accent.toUpperCase() : null,
    enabled: parsed.data.enabled,
  };
  const res = await d.update(schools).set(patch).where(eq(schools.id, schoolId)).returning({ id: schools.id });
  if (!res.length) return fail("That school no longer exists.");
  await audit(d, admin.id, "school.update", schoolId, patch);
  refresh(true);
  return { ok: true, message: "Saved." };
}

export async function refetchSchoolLogo(schoolId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const school = await refreshSchoolFacts(env(), d, schoolId, { force: true });
  if (!school) return fail("That school no longer exists.");
  await audit(d, admin.id, "school.logo_refetch", schoolId, { source: school.logoSource });
  refresh(true);
  return school.logoSource && school.logoSource !== "none"
    ? { ok: true, message: `Found a logo (${school.logoSource}).` }
    : fail("Couldn't find a logo online. Upload one instead.");
}

const LOGO_TYPES: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const MAX_LOGO_BYTES = 1_000_000;

export async function uploadSchoolLogo(schoolId: string, data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const file = data.get("logo");
  if (!(file instanceof File) || !file.size) return fail("Choose an image first.");
  if (file.size > MAX_LOGO_BYTES) return fail("Logos can be up to 1 MB.");
  const bytes = await file.arrayBuffer();
  // Sniff instead of trusting the browser; MEDIA serves these publicly from our own origin.
  const contentType = LOGO_TYPES[sniffFormat(new Uint8Array(bytes))];
  if (!contentType) return fail("Use a PNG, JPG, WebP or GIF.");

  const d = db();
  const school = (await d.select().from(schools).where(eq(schools.id, schoolId)).limit(1))[0];
  if (!school) return fail("That school no longer exists.");
  const logoKey = await storeLogo(env(), school.slug, { bytes, contentType, source: "admin" });
  await d.update(schools).set({ logoKey, logoSource: "admin" }).where(eq(schools.id, schoolId));
  await audit(d, admin.id, "school.logo_upload", schoolId, { logoKey });
  refresh(true);
  return { ok: true, message: "Logo updated." };
}

// ── Meetup spots ─────────────────────────────────────────────────

const SpotInput = z.object({
  name: z.string().trim().min(2, "Give the spot a name.").max(60, "Keep the name under 60 characters."),
  note: z.string().trim().max(120, "Keep the note under 120 characters."),
  position: z.number().int().min(0).max(999).nullable(),
});

function readSpot(data: FormData) {
  const rawPosition = field(data, "position");
  return SpotInput.safeParse({
    name: field(data, "name"),
    note: field(data, "note"),
    position: rawPosition === "" ? null : Number(rawPosition),
  });
}

export async function addMeetupSpot(schoolId: string, data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = readSpot(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = db();
  const school = (await d.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId)).limit(1))[0];
  if (!school) return fail("That school no longer exists.");
  const [{ top }] = await d.select({ top: max(meetupSpots.position) }).from(meetupSpots).where(eq(meetupSpots.schoolId, schoolId));
  const id = newId("spot");
  await d.insert(meetupSpots).values({
    id,
    schoolId,
    name: parsed.data.name,
    note: parsed.data.note || null,
    position: parsed.data.position ?? (top == null ? 0 : top + 1),
  });
  await audit(d, admin.id, "spot.add", id, { schoolId, name: parsed.data.name });
  refresh(true);
  return { ok: true, message: `Added ${parsed.data.name}.` };
}

export async function updateMeetupSpot(spotId: string, data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = readSpot(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = db();
  const patch = { name: parsed.data.name, note: parsed.data.note || null, ...(parsed.data.position != null && { position: parsed.data.position }) };
  const res = await d.update(meetupSpots).set(patch).where(eq(meetupSpots.id, spotId)).returning({ id: meetupSpots.id });
  if (!res.length) return fail("That spot no longer exists.");
  await audit(d, admin.id, "spot.update", spotId, patch);
  refresh(true);
  return { ok: true, message: "Saved." };
}

export async function deleteMeetupSpot(spotId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const res = await d.delete(meetupSpots).where(eq(meetupSpots.id, spotId)).returning({ name: meetupSpots.name });
  if (!res.length) return fail("That spot no longer exists.");
  await audit(d, admin.id, "spot.delete", spotId, { name: res[0].name });
  refresh(true);
  return { ok: true, message: `Removed ${res[0].name}.` };
}

// ── Users ────────────────────────────────────────────────────────

async function getUser(id: string) {
  return (await db().select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export async function setUserStatus(userId: string, status: "active" | "banned"): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (status !== "active" && status !== "banned") return fail("Unknown status.");
  if (userId === admin.id) return fail("You can't ban yourself.");
  const target = await getUser(userId);
  if (!target) return fail("That user no longer exists.");
  const d = db();

  if (status === "banned") {
    // Signing them out and pausing their listings takes them off the feed right away.
    // Pending listings are paused too so a later photo approval can't publish them.
    await d.batch([
      d.update(users).set({ status: "banned" }).where(eq(users.id, userId)),
      d.delete(sessions).where(eq(sessions.userId, userId)),
      d
        .update(listings)
        .set({ status: "paused", updatedAt: new Date() })
        .where(and(eq(listings.ownerId, userId), inArray(listings.status, ["active", "pending_verification"]))),
    ]);
    await closeOpenRentals(env(), d, { userId }, "user_banned");
  } else {
    await d.update(users).set({ status: "active" }).where(eq(users.id, userId));
  }
  await audit(d, admin.id, status === "banned" ? "user.ban" : "user.unban", userId, { email: target.email });
  refresh(true);
  return {
    ok: true,
    message: status === "banned" ? `Banned ${target.email}. Their listings are paused.` : `Unbanned ${target.email}. Their listings stay paused until they turn them back on.`,
  };
}

export async function setUserRole(userId: string, role: "user" | "admin"): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (role !== "user" && role !== "admin") return fail("Unknown role.");
  if (userId === admin.id && role !== "admin") return fail("You can't remove your own admin access.");
  const target = await getUser(userId);
  if (!target) return fail("That user no longer exists.");
  if (role === "user" && adminEmails(env()).includes(target.email)) {
    return fail("This address is in ADMIN_EMAILS and gets admin back at its next sign-in. Remove it there first.");
  }
  const d = db();
  await d.update(users).set({ role }).where(eq(users.id, userId));
  await audit(d, admin.id, role === "admin" ? "user.make_admin" : "user.remove_admin", userId, { email: target.email });
  refresh(true);
  return { ok: true, message: role === "admin" ? `${target.email} is now an admin.` : `${target.email} is no longer an admin.` };
}

// ── Listings ─────────────────────────────────────────────────────

export async function removeListing(listingId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const res = await d
    .update(listings)
    .set({ status: "removed", updatedAt: new Date() })
    .where(eq(listings.id, listingId))
    .returning({ title: listings.title });
  if (!res.length) return fail("That listing no longer exists.");
  await closeOpenRentals(env(), d, { listingId }, "listing_removed");
  await audit(d, admin.id, "listing.remove", listingId, { title: res[0].title });
  refresh(true);
  return { ok: true, message: "Listing removed." };
}

export async function restoreListing(listingId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const d = db();
  const res = await d
    .update(listings)
    .set({ status: "pending_verification", updatedAt: new Date() })
    .where(and(eq(listings.id, listingId), eq(listings.status, "removed")))
    .returning({ title: listings.title });
  if (!res.length) return fail("Only removed listings can be restored.");
  const status = await recomputeListingStatus(env(), d, listingId);
  await audit(d, admin.id, "listing.restore", listingId, { title: res[0].title, status });
  refresh(true);
  return { ok: true, message: status === "active" ? "Restored and live." : "Restored. It goes live once its photos are verified." };
}

// ── Settings ─────────────────────────────────────────────────────

const toNumber = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);

const SettingsInput = z
  .object({
    aiThreshold: z.number("Set an AI threshold.").min(0.05, "AI threshold must be 0.05 or more.").max(0.95, "AI threshold must be 0.95 or less."),
    sightengineDailyCap: z.number("Set a daily cap.").int("Caps are whole numbers.").min(0).max(500, "The free plan allows 500 checks a day."),
    sightengineMonthlyCap: z.number("Set a monthly cap.").int("Caps are whole numbers.").min(0).max(2000, "The free plan allows 2,000 checks a month."),
    chatRetentionDays: z.number("Set how long chats stay open.").int("Use whole days.").min(1, "Keep chats open at least 1 day.").max(60, "Chats can stay open up to 60 days."),
  })
  .refine((s) => s.sightengineDailyCap <= s.sightengineMonthlyCap, "The daily cap can't be higher than the monthly cap.");

export async function saveAppSettings(data: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = SettingsInput.safeParse({
    aiThreshold: toNumber(data.get("aiThreshold")),
    sightengineDailyCap: toNumber(data.get("sightengineDailyCap")),
    sightengineMonthlyCap: toNumber(data.get("sightengineMonthlyCap")),
    chatRetentionDays: toNumber(data.get("chatRetentionDays")),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const next = { ...parsed.data, aiThreshold: Math.round(parsed.data.aiThreshold * 100) / 100 };
  const d = db();
  await saveSettings(d, next);
  await audit(d, admin.id, "settings.save", null, next);
  refresh();
  return { ok: true, message: "Settings saved." };
}
