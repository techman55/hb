import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { auditLog, users } from "@/db/schema";
import { Card, EmptyState, SectionTitle } from "@/components/ui/bits";
import { requireAdmin } from "@/lib/auth/current";
import { db, env } from "@/lib/server";
import { getSettings } from "@/lib/settings";
import { timeAgo } from "@/lib/utils";
import { usage } from "@/lib/verify/quota";
import { sightengineConfigured } from "@/lib/verify/sightengine";
import { Banner, Meter, PageHeader, Stat } from "./_components/ui";

export const metadata: Metadata = { title: "Overview" };

const ACTION_LABELS: Record<string, string> = {
  "photo.approve": "approved a photo",
  "photo.reject": "rejected a photo",
  "photo.rescan": "re-ran photo checks",
  "appeal.approve": "approved an access request",
  "appeal.deny": "denied an access request",
  "domain.exception": "added an exception domain",
  "domain.blocked": "blocked a domain",
  "domain.delete": "removed a domain",
  "school.add": "added a campus",
  "school.update": "edited a school",
  "school.logo_refetch": "re-fetched a school logo",
  "school.logo_upload": "uploaded a school logo",
  "spot.add": "added a meetup spot",
  "spot.update": "edited a meetup spot",
  "spot.delete": "removed a meetup spot",
  "user.ban": "banned",
  "user.unban": "unbanned",
  "user.make_admin": "made an admin:",
  "user.remove_admin": "removed admin from",
  "listing.remove": "removed a listing",
  "listing.restore": "restored a listing",
  "settings.save": "changed settings",
};

type Counts = {
  users: number;
  newUsers: number;
  schools: number;
  listings: number;
  rentalsOut: number;
  rentalsUpcoming: number;
  photos: number;
  appeals: number;
};

function subject(action: string, target: string | null, detail: Record<string, unknown> | null) {
  const pick = (k: string) => (typeof detail?.[k] === "string" ? (detail[k] as string) : null);
  return pick("email") ?? pick("title") ?? pick("name") ?? (action.startsWith("domain.") ? target : null);
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const d = db();
  const e = env();

  const [countRows, settings, sightengine, activity] = await Promise.all([
    d.all<Counts>(sql`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE created_at > (unixepoch() - 7 * 86400) * 1000) AS newUsers,
        (SELECT COUNT(*) FROM schools WHERE enabled = 1) AS schools,
        (SELECT COUNT(*) FROM listings WHERE status = 'active') AS listings,
        (SELECT COUNT(*) FROM rentals WHERE status = 'active') AS rentalsOut,
        (SELECT COUNT(*) FROM rentals WHERE status = 'accepted') AS rentalsUpcoming,
        (SELECT COUNT(*) FROM listing_photos WHERE scan_status IN ('flagged', 'quota_hold') AND upload_status = 'uploaded') AS photos,
        (SELECT COUNT(*) FROM access_appeals WHERE status = 'pending') AS appeals`),
    getSettings(d),
    usage(d, "sightengine"),
    d
      .select({ log: auditLog, actorName: users.name, actorEmail: users.email })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.createdAt))
      .limit(8),
  ]);
  const c = countRows[0];

  return (
    <div>
      <PageHeader title="Overview" />

      {(!sightengineConfigured(e) || !e.OPENAI_API_KEY) && (
        <div className="mb-6 flex flex-col gap-3">
          {!sightengineConfigured(e) && (
            <Banner title="Sightengine isn't configured">
              The AI-image classifier is off, so photos pass on metadata and provenance checks alone. Set
              SIGHTENGINE_API_USER and SIGHTENGINE_API_SECRET.
            </Banner>
          )}
          {!e.OPENAI_API_KEY && (
            <Banner title="OpenAI isn't configured">
              Listing generation and OpenAI&apos;s provenance check are off. Set OPENAI_API_KEY.
            </Banner>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Users" value={c.users.toLocaleString()} hint={c.newUsers ? `${c.newUsers} new this week` : "None new this week"} href="/admin/users" />
        <Stat label="Schools on" value={c.schools.toLocaleString()} href="/admin/schools" />
        <Stat label="Live listings" value={c.listings.toLocaleString()} href="/admin/listings?status=active" />
        <Stat label="Rentals out" value={c.rentalsOut.toLocaleString()} hint={`${c.rentalsUpcoming} accepted, not picked up`} />
        <Stat label="Photos to review" value={c.photos.toLocaleString()} href="/admin/photos" />
        <Stat label="Access requests" value={c.appeals.toLocaleString()} hint="Pending" href="/admin/appeals" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle action={<Link href="/admin/settings" className="text-sm text-muted hover:text-ink">Caps</Link>}>
            Sightengine usage
          </SectionTitle>
          <Card className="flex flex-col gap-5 p-5">
            <Meter label="Today" used={sightengine.day} cap={settings.sightengineDailyCap} />
            <Meter label="This month" used={sightengine.month} cap={settings.sightengineMonthlyCap} />
            <p className="text-xs text-muted">
              Photos scoring {Math.round(settings.aiThreshold * 100)}% or higher are held for review. When a cap is hit,
              new photos wait in the queue until quota frees up.
            </p>
          </Card>
        </section>

        <section>
          <SectionTitle>Recent admin activity</SectionTitle>
          {activity.length ? (
            <Card className="divide-y divide-line">
              {activity.map(({ log, actorName, actorEmail }) => {
                const what = subject(log.action, log.target, log.detail ?? null);
                return (
                  <div key={log.id} className="flex items-baseline gap-3 px-5 py-3 text-sm">
                    <p className="min-w-0 flex-1">
                      <span className="font-semibold">{actorName ?? actorEmail ?? "Someone"}</span>{" "}
                      <span className="text-muted">{ACTION_LABELS[log.action] ?? log.action}</span>
                      {what && <span className="break-all"> {what}</span>}
                    </p>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(log.createdAt)}</span>
                  </div>
                );
              })}
            </Card>
          ) : (
            <EmptyState title="Nothing yet" body="Approvals, bans and setting changes show up here." />
          )}
        </section>
      </div>
    </div>
  );
}
