import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, Wallet } from "lucide-react";
import { HandoffCode } from "@/components/rental/handoff-code";
import { RenterCancel } from "@/components/rental/rental-actions";
import { RentalSummary } from "@/components/rental/rental-summary";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/current";
import { getRentalDetail, payLinks } from "@/lib/rentals/detail";
import { db } from "@/lib/server";
import { firstName, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "My Dibs" };

export default async function RenterRentalPage({ params }: PageProps<"/dibs/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await getRentalDetail(db(), id, user.id);
  if (!detail || detail.role !== "renter") notFound();
  const { rental, other, listing } = detail;
  const owner = firstName(other.name, "the owner");
  const links = payLinks(other, rental.totalCents, listing.title);
  const showCode = rental.status === "accepted" || rental.status === "active";

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dibs" className="-ml-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2">
        <ChevronLeft className="size-4" /> My Dibs
      </Link>

      {rental.status === "accepted" && <PayCard owner={owner} total={rental.totalCents} links={links} beforePickup />}

      {showCode && (
        <section>
          <HandoffCode rentalId={rental.id} initialStatus={rental.status} />
          <p className="mt-3 text-center text-sm text-muted">
            {rental.status === "accepted"
              ? `Once you've paid, ${owner} scans this to confirm the pickup.`
              : `When you return it, ${owner} scans this to close it out.`}
          </p>
        </section>
      )}

      {rental.status === "requested" && (
        <p className="rounded-3xl bg-accent-soft px-5 py-4 text-[15px] text-accent">
          Waiting for {owner} to accept. Their answer shows up here and in chat, and you can message them in the meantime.
        </p>
      )}

      <RentalSummary detail={detail} />

      {rental.status === "active" && <PayCard owner={owner} total={rental.totalCents} links={links} />}

      <RenterCancel rentalId={rental.id} status={rental.status} />
    </div>
  );
}

/** Payment happens in person, outside Dibs, and comes before the pickup scan. */
function PayCard({
  owner,
  total,
  links,
  beforePickup,
}: {
  owner: string;
  total: number;
  links: { label: string; href: string }[];
  beforePickup?: boolean;
}) {
  const apps = links.length ? "These open your app with the amount filled in." : `Ask ${owner} how they'd like to be paid.`;
  return (
    <section className={beforePickup ? "rounded-[28px] bg-accent-soft p-5" : "rounded-[28px] bg-surface p-5 ring-1 ring-line"}>
      <p className="flex items-center gap-2 font-semibold">
        <Wallet className="size-5" /> {beforePickup ? `Pay ${owner} before they scan` : `Paying ${owner}`}
      </p>
      <p className="mt-1 text-sm text-muted">
        {beforePickup
          ? `Send ${formatMoney(total)} first. ${owner} scans your code only after you've paid, and the scan is what starts the rental. ${apps}`
          : `${formatMoney(total)} was due at pickup, paid in person outside Dibs. If you haven't paid yet, do it now. ${apps}`}
      </p>
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map((l) => (
            <Button key={l.href} asChild variant={beforePickup ? "primary" : "secondary"} size="sm">
              <a href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label} <ExternalLink className="size-3.5" />
              </a>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
