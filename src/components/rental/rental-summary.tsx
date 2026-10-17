import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import type { RentalDetail } from "@/lib/rentals/detail";
import { formatMoney } from "@/lib/utils";
import { rentalTiming, Thumb } from "./rental-bits";

export function RentalSummary({ detail }: { detail: RentalDetail }) {
  const { rental, listing, other, role, dueDate } = detail;
  const t = rentalTiming({ status: rental.status, startDate: rental.startDate, dueDate }, role);
  return (
    <div className="rounded-[28px] bg-surface p-5 ring-1 ring-line">
      <Link href={`/listing/${listing.id}`} className="flex items-center gap-4">
        <Thumb src={listing.coverUrl} className="size-20" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight">{listing.title}</p>
          <Badge tone={t.tone} className="mt-1.5">
            {t.label}
          </Badge>
        </div>
      </Link>
      <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Pickup</dt>
          <dd className="font-semibold">{formatDay(rental.startDate)}</dd>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Back by</dt>
          <dd className="font-semibold">{formatDay(dueDate)}</dd>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Total</dt>
          <dd className="font-semibold">{formatMoney(rental.totalCents)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center gap-3">
        <Avatar name={other.name} email={other.email} size={36} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{other.name ?? "A student"}</p>
          <p className="text-muted">{role === "owner" ? "Renter" : "Owner"}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/inbox/${rental.id}`}>
            <MessageCircle className="size-4" /> Chat
          </Link>
        </Button>
      </div>
    </div>
  );
}
