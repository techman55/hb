import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Wallet } from "lucide-react";
import { OwnerActions } from "@/components/rental/rental-actions";
import { RentalSummary } from "@/components/rental/rental-summary";
import { requireUser } from "@/lib/auth/current";
import { getRentalDetail, payHandles } from "@/lib/rentals/detail";
import { db } from "@/lib/server";
import { firstName, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Rental" };

const OWNER_COPY: Record<string, string> = {
  requested: "Accept to hold these dates for them. You'll sort out the pickup spot in chat.",
  accepted: "At pickup, scan the code on their phone once they've paid. That's how both of you know the handoff happened.",
  active: "When they bring it back, scan their return code to close it out.",
  returned: "All done. Thanks for lending.",
  declined: "You declined this request.",
  cancelled: "This rental was cancelled.",
  expired: "This rental expired.",
};

export default async function OwnerRentalPage({ params }: PageProps<"/lending/rentals/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await getRentalDetail(db(), id, user.id);
  if (!detail || detail.role !== "owner") notFound();
  const renter = firstName(detail.other.name, "the renter");
  const total = formatMoney(detail.rental.totalCents);
  const handles = payHandles(user);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/lending" className="-ml-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2">
        <ChevronLeft className="size-4" /> Lending
      </Link>
      <RentalSummary detail={detail} />
      {detail.rental.note && (
        <p className="rounded-3xl bg-surface-2 px-5 py-4 text-[15px]">
          <span className="block text-xs font-semibold text-muted">{firstName(detail.other.name, "They")} wrote</span>“{detail.rental.note}”
        </p>
      )}
      {detail.rental.status === "accepted" && (
        <section className="rounded-[28px] bg-accent-soft p-5">
          <p className="flex items-center gap-2 font-semibold">
            <Wallet className="size-5" /> Get paid before you scan
          </p>
          <p className="mt-1 text-sm text-muted">
            Collect {total} from {renter} first. Scanning their code confirms the pickup, so do it only once the money is in.{" "}
            {handles ? (
              <>
                Let {renter} know they can pay you with {handles} before you scan. Their My Dibs page has a button with the amount filled in.
              </>
            ) : (
              <>
                Cash works, or{" "}
                <Link href="/me#profile" className="font-medium text-ink underline underline-offset-2">
                  add Venmo or Cash App
                </Link>{" "}
                to give renters a one-tap pay button.
              </>
            )}
          </p>
        </section>
      )}
      <p className="text-[15px] text-muted">{OWNER_COPY[detail.rental.status]}</p>
      <OwnerActions rentalId={id} status={detail.rental.status} renterName={renter} total={total} handles={handles} />
    </div>
  );
}
