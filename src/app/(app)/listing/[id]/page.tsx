import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { ChevronLeft, Users } from "lucide-react";
import { listings } from "@/db/schema";
import { DibsButton } from "@/components/listing/dibs-sheet";
import { ExpandableText, PhotoCarousel } from "@/components/listing/photo-carousel";
import { SchoolChip } from "@/components/school-chip";
import { Button } from "@/components/ui/button";
import { Avatar, Badge } from "@/components/ui/bits";
import { requireUser } from "@/lib/auth/current";
import { categoryName, CONDITION_LABELS } from "@/lib/categories";
import { formatDay, todayISO } from "@/lib/dates";
import { getListingDetail } from "@/lib/listings/queries";
import { db, waitUntil } from "@/lib/server";
import { firstName, formatMoney } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/listing/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = (await db().select({ title: listings.title, visibility: listings.visibility }).from(listings).where(eq(listings.id, id)).limit(1))[0];
  return { title: row?.visibility === "public" ? row.title : "Listing" };
}

const RENTAL_COPY: Record<string, string> = {
  requested: "Your dibs is waiting on the owner.",
  accepted: "You've got dibs. Pickup details are in My Dibs.",
  active: "You have this right now.",
};

export default async function ListingPage({ params }: PageProps<"/listing/[id]">) {
  const { id } = await params;
  const user = await requireUser({ next: `/listing/${id}` });
  const detail = await getListingDetail(db(), { id: user.id, schoolId: user.schoolId }, id);
  if (!detail) notFound();
  const { listing, isOwner, photos, owner, school, otherCampus, distanceMi, isFriend, booked, myRental } = detail;

  if (!isOwner) {
    waitUntil(db().update(listings).set({ views: sql`${listings.views} + 1` }).where(eq(listings.id, id)).then(() => undefined));
  }

  return (
    <div className="lg:pt-2">
      <Link href="/" className="-ml-2 mb-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2 lg:hidden">
        <ChevronLeft className="size-4" /> Back
      </Link>

      <PhotoCarousel photos={photos.map((p) => ({ id: p.id, url: p.url }))} className="-mx-4 rounded-none sm:mx-0 sm:rounded-[28px]" />

      <div className="mt-5 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold leading-tight tracking-tight">{listing.title}</h1>
        <p className="shrink-0 text-right">
          <span className="text-2xl font-bold">{formatMoney(listing.priceCents)}</span>
          <span className="text-muted">/day</span>
        </p>
      </div>

      <Link href={isOwner ? "/me" : `/u/${owner.id}`} className="mt-4 flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line transition hover:ring-ink/30">
        <Avatar name={owner.name} email={owner.email} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            {isOwner ? "You" : (owner.name ?? "A student")}
            {isFriend && (
              <Badge tone="accent">
                <Users className="size-3" /> Friend
              </Badge>
            )}
          </p>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <SchoolChip school={school} label={school.name} className="max-w-[16rem]" />
            {otherCampus && distanceMi != null && <span>{distanceMi} mi away</span>}
          </div>
        </div>
      </Link>

      {listing.description && (
        <div className="mt-5">
          <ExpandableText text={listing.description} />
        </div>
      )}

      {listing.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {listing.tags.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium">
              {t}
            </span>
          ))}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3">
        {[
          ["Condition", CONDITION_LABELS[listing.condition]],
          ["Rent for", `Up to ${listing.maxDays} ${listing.maxDays === 1 ? "day" : "days"}`],
          ["Category", categoryName(listing.category)],
          ["Week total", formatMoney(listing.priceCents * Math.min(7, listing.maxDays))],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
            <dt className="text-xs font-medium text-muted">{k}</dt>
            <dd className="mt-0.5 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {listing.included.length > 0 && (
        <div className="mt-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          <p className="text-xs font-medium text-muted">Comes with</p>
          <p className="mt-0.5 font-semibold">{listing.included.join(", ")}</p>
        </div>
      )}

      {booked.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Booked: {booked.map((b) => `${formatDay(b.startDate, { month: "short", day: "numeric" })} (${b.days}d)`).join(", ")}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:sticky lg:bottom-4 lg:mt-8 lg:rounded-3xl lg:border lg:shadow-lg">
        <div className="mx-auto flex max-w-[680px] items-center gap-3">
          {isOwner ? (
            <>
              <p className="flex-1 text-sm text-muted">This is your listing.</p>
              <Button asChild variant="secondary">
                <Link href={`/lending/${listing.id}`}>Manage</Link>
              </Button>
            </>
          ) : myRental ? (
            <>
              <p className="flex-1 text-sm font-medium">{RENTAL_COPY[myRental.status]}</p>
              <Button asChild>
                <Link href={`/dibs/${myRental.id}`}>Open</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="hidden flex-1 sm:block">
                <p className="font-semibold">{formatMoney(listing.priceCents)}/day</p>
                <p className="text-sm text-muted">Up to {listing.maxDays} days · pay in person</p>
              </div>
              <DibsButton
                listingId={listing.id}
                title={listing.title}
                priceCents={listing.priceCents}
                maxDays={listing.maxDays}
                booked={booked}
                today={todayISO()}
                ownerFirstName={firstName(owner.name, "the owner")}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
