import type { Metadata } from "next";
import { and, count, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { ImageOff, Images } from "lucide-react";
import { listingPhotos, listings, schools, users, type ScanStatus } from "@/db/schema";
import { Badge, Card, EmptyState } from "@/components/ui/bits";
import { param } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/current";
import { mediaUrl } from "@/lib/media";
import { db } from "@/lib/server";
import { timeAgo } from "@/lib/utils";
import type { ScanReport } from "@/lib/verify/pipeline";
import { FilterChips, PageHeader } from "../_components/ui";
import { PhotoActions } from "./photo-actions";
import { ScanReportView } from "./scan-report";

export const metadata: Metadata = { title: "Photo review" };

const QUEUE: ScanStatus[] = ["flagged", "quota_hold", "error"];
const DECIDED: ScanStatus[] = ["approved", "rejected"];

const STATUS: Partial<Record<ScanStatus, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }>> = {
  flagged: { label: "Flagged", tone: "danger" },
  quota_hold: { label: "Quota hold", tone: "warn" },
  error: { label: "Error", tone: "warn" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  queued: { label: "Re-checking", tone: "neutral" },
  scanning: { label: "Re-checking", tone: "neutral" },
};

export default async function PhotoReviewPage({ searchParams }: PageProps<"/admin/photos">) {
  await requireAdmin();
  const view = param((await searchParams).view) === "decided" ? "decided" : "queue";
  const d = db();
  const owner = alias(users, "owner");
  const reviewer = alias(users, "reviewer");

  const queueWhere = and(
    inArray(listingPhotos.scanStatus, QUEUE),
    eq(listingPhotos.uploadStatus, "uploaded"),
    ne(listings.status, "removed"),
  );
  const decidedWhere = and(inArray(listingPhotos.scanStatus, DECIDED), isNotNull(listingPhotos.reviewedAt));

  const [rows, [{ n: queueCount }]] = await Promise.all([
    d
      .select({
        photo: listingPhotos,
        listingTitle: listings.title,
        listingStatus: listings.status,
        ownerName: owner.name,
        ownerEmail: owner.email,
        schoolName: schools.shortName,
        reviewerName: reviewer.name,
        reviewerEmail: reviewer.email,
      })
      .from(listingPhotos)
      .innerJoin(listings, eq(listings.id, listingPhotos.listingId))
      .leftJoin(owner, eq(owner.id, listingPhotos.ownerId))
      .leftJoin(schools, eq(schools.id, listings.schoolId))
      .leftJoin(reviewer, eq(reviewer.id, listingPhotos.reviewedBy))
      .where(view === "queue" ? queueWhere : decidedWhere)
      .orderBy(view === "queue" ? desc(listingPhotos.createdAt) : desc(listingPhotos.reviewedAt))
      .limit(view === "queue" ? 100 : 50),
    d
      .select({ n: count() })
      .from(listingPhotos)
      .innerJoin(listings, eq(listings.id, listingPhotos.listingId))
      .where(queueWhere),
  ]);

  return (
    <div>
      <PageHeader
        title="Photo review"
        description="Photos the AI checks couldn't clear. Approving overrides the checks; rejecting asks the owner for a new photo."
      />
      <div className="mb-5">
        <FilterChips
          items={[
            { href: "/admin/photos", label: "Needs review", active: view === "queue", count: queueCount },
            { href: "/admin/photos?view=decided", label: "Recently decided", active: view === "decided" },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Images className="size-6" />}
          title={view === "queue" ? "All caught up" : "No decisions yet"}
          body={view === "queue" ? "Held photos show up here." : "Photos you approve or reject show up here."}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r) => {
            const p = r.photo;
            const src = mediaUrl(p.displayKey ?? p.thumbKey);
            const status = STATUS[p.scanStatus] ?? { label: p.scanStatus, tone: "neutral" as const };
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="grid sm:grid-cols-[240px_minmax(0,1fr)]">
                  {src ? (
                    <a href={src} target="_blank" rel="noopener" className="block bg-surface-2" aria-label="Open full-size photo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="aspect-square w-full object-cover sm:aspect-auto sm:h-full" />
                    </a>
                  ) : (
                    <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-surface-2 text-sm text-muted sm:aspect-auto">
                      <ImageOff className="size-6" /> No preview
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <Badge tone="neutral">{p.source === "camera" ? "Camera" : "Upload"}</Badge>
                      {p.scanScore != null && <Badge tone="neutral">{Math.round(p.scanScore * 100)}% AI</Badge>}
                      <span className="text-xs text-muted">{timeAgo(p.createdAt)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.listingTitle || "Untitled listing"}</p>
                      <p className="truncate text-sm text-muted">
                        {[r.ownerName, r.ownerEmail, r.schoolName].filter(Boolean).join(" · ")}
                        {r.listingStatus === "drafting" && " · still drafting"}
                      </p>
                    </div>
                    <p className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">{p.scanReason || "No reason recorded."}</p>
                    {view === "decided" && (
                      <p className="text-xs text-muted">
                        {p.scanStatus === "approved" ? "Approved" : "Rejected"} by {r.reviewerName ?? r.reviewerEmail ?? "an admin"}
                        {p.reviewedAt && ` · ${timeAgo(p.reviewedAt)}`}
                        {p.reviewNote && ` · “${p.reviewNote}”`}
                      </p>
                    )}
                    <details className="group">
                      <summary className="cursor-pointer select-none text-sm font-medium text-muted hover:text-ink">
                        Check details
                      </summary>
                      <div className="mt-3">
                        <ScanReportView report={(p.scanReport as Partial<ScanReport> | null) ?? null} />
                      </div>
                    </details>
                    <PhotoActions photoId={p.id} status={p.scanStatus} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
