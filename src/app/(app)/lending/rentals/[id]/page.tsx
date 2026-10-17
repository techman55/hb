import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { OwnerActions } from "@/components/rental/rental-actions";
import { RentalSummary } from "@/components/rental/rental-summary";
import { requireUser } from "@/lib/auth/current";
import { getRentalDetail } from "@/lib/rentals/detail";
import { db } from "@/lib/server";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Rental" };

const OWNER_COPY: Record<string, string> = {
  requested: "Accept to hold these dates for them. You'll sort out the pickup spot in chat.",
  accepted: "At pickup, scan the code on their phone. That's how both of you know the handoff happened.",
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
      <p className="text-[15px] text-muted">{OWNER_COPY[detail.rental.status]}</p>
      <OwnerActions rentalId={id} status={detail.rental.status} renterName={firstName(detail.other.name, "the renter")} />
    </div>
  );
}
