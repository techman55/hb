// The anti-AI layer. Every seller photo goes through, cheapest check first:
//   1. metadata.ts          — free, in-Worker (C2PA / IPTC / EXIF / generator text chunks)
//   2. openai-provenance.ts — OpenAI SynthID + C2PA (same API key as listing generation)
//   3. sightengine.ts       — pixel classifier, metered against the free plan
// A definitive hit from 1 or 2 skips 3 to save quota. Anything suspicious waits for an admin.

import { and, eq, inArray, lt, or } from "drizzle-orm";
import type { DB } from "@/db";
import { listingPhotos, listings, type ScanStatus } from "@/db/schema";
import type { Env } from "@/lib/env";
import { isDev } from "@/lib/env";
import { analysisJpeg } from "@/lib/images";
import { recomputeListingStatus } from "@/lib/listings/status";
import { getSettings } from "@/lib/settings";
import { scanMetadata, type MetadataReport } from "./metadata";
import { checkOpenAIProvenance, type ProvenanceResult } from "./openai-provenance";
import { release, reserve } from "./quota";
import { checkSightengine, sightengineConfigured, type SightengineResult } from "./sightengine";

const MAX_ATTEMPTS = 3;

/**
 * Slot for Google's SynthID Content Detection API (partner preview as of Oct 2026). Implement
 * `detect` and register it below once the org has access; until then it reports "not_configured".
 */
export interface WatermarkDetector {
  name: string;
  detect(env: Env, image: Blob): Promise<{ status: "ok" | "not_configured" | "error"; detected?: boolean; note?: string }>;
}
const googleSynthId: WatermarkDetector = {
  name: "google-synthid",
  async detect() {
    return { status: "not_configured", note: "Google Content Detection API access pending" };
  },
};

export type ScanReport = {
  checkedAt: string;
  attempts: number;
  metadata?: MetadataReport;
  openai?: ProvenanceResult;
  sightengine?: SightengineResult | { status: "quota"; note: string } | { status: "not_needed"; note: string };
  google?: Awaited<ReturnType<WatermarkDetector["detect"]>>;
  verdict: { status: ScanStatus; reason: string; score?: number };
};

export async function scanPhoto(env: Env, db: DB, photoId: string): Promise<ScanStatus> {
  const photo = (await db.select().from(listingPhotos).where(eq(listingPhotos.id, photoId)).limit(1))[0];
  if (!photo || photo.uploadStatus !== "uploaded") return photo?.scanStatus ?? "none";
  if (["passed", "approved", "rejected"].includes(photo.scanStatus)) return photo.scanStatus;

  const previous = (photo.scanReport ?? {}) as Partial<ScanReport>;
  const attempts = (previous.attempts ?? 0) + 1;
  await db.update(listingPhotos).set({ scanStatus: "scanning" }).where(eq(listingPhotos.id, photoId));

  const report: ScanReport = { checkedAt: new Date().toISOString(), attempts, verdict: { status: "passed", reason: "" } };
  const settings = await getSettings(db);

  try {
    const original = await env.UPLOADS.get(photo.originalKey);
    if (!original) throw new Error("original missing");
    const bytes = new Uint8Array(await original.arrayBuffer());

    report.metadata = await scanMetadata(bytes);
    if (report.metadata.format === "unknown") {
      report.verdict = { status: "rejected", reason: "Not an image file" };
      return await finish(env, db, photo.listingId, photoId, report);
    }

    const analysis = await analysisJpeg(env, photo.originalKey);
    const [openai, google] = await Promise.all([checkOpenAIProvenance(env, analysis), googleSynthId.detect(env, analysis)]);
    report.openai = openai;
    report.google = google;

    const definitive = report.metadata.signals.filter((s) => s.level === "definitive").map((s) => s.label);
    if (openai.status === "ok" && openai.synthid === "detected") definitive.push("SynthID watermark detected (OpenAI)");
    if (openai.status === "ok" && openai.c2pa === "detected") definitive.push("C2PA manifest says OpenAI generated it");
    if (google.status === "ok" && google.detected) definitive.push("SynthID watermark detected (Google)");
    const review = report.metadata.signals.filter((s) => s.level === "review").map((s) => s.label);

    if (definitive.length) {
      report.sightengine = { status: "not_needed", note: "Provenance already conclusive" };
      report.verdict = { status: "flagged", reason: definitive.join("; ") };
      return await finish(env, db, photo.listingId, photoId, report);
    }

    if (!sightengineConfigured(env)) {
      report.sightengine = { status: "skipped", note: "Sightengine keys not set" };
      report.verdict = review.length
        ? { status: "flagged", reason: review.join("; ") }
        : { status: "passed", reason: isDev(env) ? "Dev: classifier not configured" : "Classifier not configured" };
      return await finish(env, db, photo.listingId, photoId, report);
    }

    const caps = { daily: settings.sightengineDailyCap, monthly: settings.sightengineMonthlyCap };
    if (!(await reserve(db, "sightengine", caps))) {
      report.sightengine = { status: "quota", note: "Free-tier cap reached; waiting for the quota to reset or an admin" };
      report.verdict = { status: "quota_hold", reason: "Classifier quota reached" };
      return await finish(env, db, photo.listingId, photoId, report);
    }

    const se = await checkSightengine(env, analysis);
    report.sightengine = se;
    if (se.status === "ok") {
      if (se.score >= settings.aiThreshold) {
        const top = se.topGenerators[0];
        report.verdict = {
          status: "flagged",
          score: se.score,
          reason: `Classifier: ${Math.round(se.score * 100)}% likely AI${top && top.score > 0.2 ? ` (looks like ${top.name})` : ""}`,
        };
      } else if (review.length) {
        report.verdict = { status: "flagged", score: se.score, reason: review.join("; ") };
      } else {
        report.verdict = { status: "passed", score: se.score, reason: "All checks passed" };
      }
      return await finish(env, db, photo.listingId, photoId, report);
    }

    await release(db, "sightengine");
    if (se.status === "retry" && attempts < MAX_ATTEMPTS) {
      report.verdict = { status: "queued", reason: `Will retry: ${se.note}` };
    } else {
      report.verdict = { status: "flagged", reason: `Couldn't finish the AI check (${se.note})` };
    }
    return await finish(env, db, photo.listingId, photoId, report);
  } catch (err) {
    console.error("scanPhoto failed", photoId, err);
    report.verdict =
      attempts < MAX_ATTEMPTS
        ? { status: "queued", reason: `Will retry: ${String(err).slice(0, 120)}` }
        : { status: "flagged", reason: "Couldn't finish the checks" };
    return finish(env, db, photo.listingId, photoId, report);
  }
}

async function finish(env: Env, db: DB, listingId: string, photoId: string, report: ScanReport): Promise<ScanStatus> {
  const status = report.verdict.status;
  await db
    .update(listingPhotos)
    .set({
      scanStatus: status,
      scanScore: report.verdict.score ?? null,
      scanReason: report.verdict.reason,
      scanReport: report as unknown as Record<string, unknown>,
      scannedAt: new Date(),
    })
    .where(eq(listingPhotos.id, photoId));

  const listing = (await db.select().from(listings).where(eq(listings.id, listingId)).limit(1))[0];
  if (listing && listing.status !== "drafting") {
    await recomputeListingStatus(env, db, listingId);
  }
  return status;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scans a set of photos one at a time, spaced for Sightengine's 1 request/second limit. */
export async function scanPhotos(env: Env, db: DB, photoIds: string[]) {
  for (let i = 0; i < photoIds.length; i++) {
    if (i > 0) await sleep(1100);
    await scanPhoto(env, db, photoIds[i]);
  }
}

/** Cron: pick up queued scans that stalled, retries, and quota holds once quota frees up. */
export async function sweepScans(env: Env, db: DB, now = new Date()) {
  const stale = new Date(now.getTime() - 5 * 60 * 1000);
  const rows = await db
    .select({ id: listingPhotos.id })
    .from(listingPhotos)
    .where(
      and(
        eq(listingPhotos.uploadStatus, "uploaded"),
        or(
          and(inArray(listingPhotos.scanStatus, ["queued", "scanning"]), lt(listingPhotos.createdAt, stale)),
          eq(listingPhotos.scanStatus, "quota_hold"),
        ),
      ),
    )
    .limit(20);
  await scanPhotos(env, db, rows.map((r) => r.id));
}
