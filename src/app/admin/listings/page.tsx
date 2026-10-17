import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { ImageOff, Package } from "lucide-react";
import { LISTING_STATUSES, listings, schools, users, type Listing } from "@/db/schema";
import { Badge, Card, EmptyState } from "@/components/ui/bits";
import { contains, param } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/current";
import { mediaUrl } from "@/lib/media";
import { db } from "@/lib/server";
import { formatMoney, timeAgo } from "@/lib/utils";
import { ActionButton } from "../_components/action-controls";
import { FilterChips, PageHeader, SearchBar } from "../_components/ui";
import { removeListing, restoreListing } from "../actions";

export const metadata: Metadata = { title: "Listings" };

type Status = Listing["status"];

const STATUS: Record<Status, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  drafting: { label: "Draft", tone: "neutral" },
  pending_verification: { label: "Checking photos", tone: "warn" },
  active: { label: "Live", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  removed: { label: "Removed", tone: "danger" },
};

const VISIBILITY: Record<Listing["visibility"], string> = { public: "Public", friends: "Friends only", private: "Only owner" };

export default async function ListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q);
  const raw = param(sp.status);
  const status = (LISTING_STATUSES as readonly string[]).includes(raw) ? (raw as Status) : null;
  const owner = alias(users, "owner");

  const rows = await db()
    .select({
      listing: listings,
      ownerName: owner.name,
      ownerEmail: owner.email,
      schoolName: schools.shortName,
      // Spelled out so the subquery can't bind `id` to its own table.
      cover: sql<string | null>`(SELECT COALESCE(p.thumb_key, p.display_key) FROM listing_photos p
        WHERE p.listing_id = listings.id AND p.upload_status = 'uploaded' ORDER BY p.position LIMIT 1)`,
    })
    .from(listings)
    .leftJoin(owner, eq(owner.id, listings.ownerId))
    .leftJoin(schools, eq(schools.id, listings.schoolId))
    .where(and(q ? contains(listings.title, q) : undefined, status ? eq(listings.status, status) : undefined))
    .orderBy(desc(listings.createdAt))
    .limit(50);

  const href = (s: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (s) p.set("status", s);
    const str = p.toString();
    return str ? `/admin/listings?${str}` : "/admin/listings";
  };

  return (
    <div>
      <PageHeader title="Listings" description="Removing hides a listing everywhere. Restoring re-checks its photos before it goes live again." />
      <div className="mb-5 flex flex-col gap-3">
        <SearchBar placeholder="Search by title" defaultValue={q} hidden={{ status: status ?? undefined }} />
        <FilterChips
          items={[
            { href: href(null), label: "All", active: !status },
            ...LISTING_STATUSES.map((s) => ({ href: href(s), label: STATUS[s].label, active: status === s })),
          ]}
        />
      </div>

      {rows.length ? (
        <Card className="divide-y divide-line">
          {rows.map(({ listing: l, ownerName, ownerEmail, schoolName, cover }) => {
            const src = mediaUrl(cover);
            return (
              <div key={l.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="size-14 shrink-0 rounded-2xl bg-surface-2 object-cover" />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-muted">
                      <ImageOff className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {l.status === "active" ? (
                        <Link href={`/listing/${l.id}`} className="truncate font-semibold underline-offset-4 hover:underline">
                          {l.title || "Untitled"}
                        </Link>
                      ) : (
                        <span className="truncate font-semibold">{l.title || "Untitled"}</span>
                      )}
                      <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                    </p>
                    <p className="truncate text-sm text-muted">{[ownerName ?? ownerEmail, schoolName].filter(Boolean).join(" · ")}</p>
                    <p className="text-xs text-muted">
                      {formatMoney(l.priceCents)}/day · {VISIBILITY[l.visibility]} · {timeAgo(l.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {l.status === "removed" ? (
                    <ActionButton action={restoreListing.bind(null, l.id)} confirm={`Restore “${l.title || "Untitled"}”?`}>
                      Restore
                    </ActionButton>
                  ) : (
                    <ActionButton
                      action={removeListing.bind(null, l.id)}
                      confirm={`Remove “${l.title || "Untitled"}”? It disappears from the app right away.`}
                      variant="danger"
                    >
                      Remove
                    </ActionButton>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState
          icon={<Package className="size-6" />}
          title={q || status ? "No listings match" : "No listings yet"}
          body={q || status ? "Try a different title or status." : "Listings show up here as soon as someone starts one."}
        />
      )}
      {rows.length === 50 && <p className="mt-3 text-center text-xs text-muted">Showing the 50 newest matches. Search to narrow it down.</p>}
    </div>
  );
}
