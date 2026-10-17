import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Eye, Lock, Plus, Store, Users } from "lucide-react";
import { RentalRow, Thumb } from "@/components/rental/rental-bits";
import { RequestCard } from "@/components/rental/request-card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, SectionTitle } from "@/components/ui/bits";
import { requireUser } from "@/lib/auth/current";
import { ownListings, pendingSummary, rentalsFor, type OwnListing } from "@/lib/listings/lending";
import { db } from "@/lib/server";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Lending" };

function ListingRow({ l, href, meta }: { l: OwnListing; href: string; meta: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-3xl bg-surface p-3 ring-1 ring-line transition hover:ring-ink/30">
      <Thumb src={l.coverUrl} className="size-14" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{l.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">{meta}</div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

export default async function LendingPage() {
  const user = await requireUser();
  const [requests, rentals, mine] = await Promise.all([
    rentalsFor(db(), user.id, "owner", ["requested"]),
    rentalsFor(db(), user.id, "owner", ["accepted", "active"]),
    ownListings(db(), user.id),
  ]);
  const pending = mine.filter((l) => l.status === "pending_verification");
  const active = mine.filter((l) => l.status === "active" && l.visibility !== "private");
  const hidden = mine.filter((l) => l.status === "drafting" || l.status === "paused" || (l.status === "active" && l.visibility === "private"));
  const nothing = !requests.length && !rentals.length && !pending.length && !active.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lending</h1>
          <p className="text-sm text-muted">Things you&apos;re renting out</p>
        </div>
        <Button asChild size="lg" className="hidden sm:inline-flex">
          <Link href="/lending/new">
            <Plus className="size-5" /> New listing
          </Link>
        </Button>
      </div>

      <Button asChild size="lg" className="w-full sm:hidden">
        <Link href="/lending/new">
          <Plus className="size-5" /> New listing
        </Link>
      </Button>

      {requests.length > 0 && (
        <section>
          <SectionTitle count={requests.length}>Requests</SectionTitle>
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:-mx-6 lg:px-6">
            {requests.map((r) => (
              <RequestCard key={r.id} rental={r} />
            ))}
          </div>
        </section>
      )}

      {rentals.length > 0 && (
        <section>
          <SectionTitle count={rentals.length}>Rentals</SectionTitle>
          <div className="flex flex-col gap-2">
            {rentals.map((r) => (
              <RentalRow key={r.id} rental={r} role="owner" href={`/lending/rentals/${r.id}`} />
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <SectionTitle count={pending.length}>Pending</SectionTitle>
          <div className="flex flex-col gap-2">
            {pending.map((l) => {
              const s = pendingSummary(l.photoStates);
              return <ListingRow key={l.id} l={l} href={`/lending/${l.id}`} meta={<Badge tone={s.tone}>{s.label}</Badge>} />;
            })}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section>
          <SectionTitle count={active.length}>Active listings</SectionTitle>
          <div className="flex flex-col gap-2">
            {active.map((l) => (
              <ListingRow
                key={l.id}
                l={l}
                href={`/lending/${l.id}`}
                meta={
                  <>
                    <span className="font-semibold text-ink">{formatMoney(l.priceCents)}/day</span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" /> {l.views}
                    </span>
                    {l.visibility === "friends" && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" /> Friends
                      </span>
                    )}
                    {l.rentedNow && <Badge tone="success">Rented now</Badge>}
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      {nothing && (
        <EmptyState
          icon={<Store className="size-8" />}
          title="Nothing listed yet"
          body="That calculator in your desk drawer could pay for lunch. Snap a photo and you're most of the way there."
          action={
            <Button asChild>
              <Link href="/lending/new">
                <Plus className="size-4" /> List your first item
              </Link>
            </Button>
          }
        />
      )}

      {hidden.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-semibold text-muted">
            <Lock className="size-4" /> Drafts &amp; private ({hidden.length})
            <ChevronRight className="size-4 transition group-open:rotate-90" />
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {hidden.map((l) => (
              <ListingRow
                key={l.id}
                l={l}
                href={l.status === "drafting" ? `/lending/new?id=${l.id}` : `/lending/${l.id}`}
                meta={
                  <Badge tone="neutral">{l.status === "drafting" ? "Unfinished. Tap to continue" : l.status === "paused" ? "Paused" : "Only you"}</Badge>
                }
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
