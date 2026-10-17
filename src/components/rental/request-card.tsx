"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import type { RentalCardData } from "@/lib/listings/lending";
import { firstName, formatMoney } from "@/lib/utils";
import { answerDibs } from "@/app/actions/rentals";
import { Thumb } from "./rental-bits";

export function RequestCard({ rental }: { rental: RentalCardData }) {
  const [pending, start] = useTransition();
  const answer = (accept: boolean) =>
    start(async () => {
      const res = await answerDibs(rental.id, accept);
      if (!res.ok) toast.error(res.error);
      else toast.success(accept ? `Accepted. Coordinate pickup with ${firstName(rental.otherName, "them")} in chat.` : "Declined");
    });
  return (
    <div className="w-[85%] max-w-sm shrink-0 snap-start rounded-3xl bg-surface p-4 ring-1 ring-line sm:w-80">
      <Link href={`/lending/rentals/${rental.id}`} className="flex items-center gap-3">
        <Thumb src={rental.coverUrl} className="size-12" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {firstName(rental.otherName, "Someone")} wants {rental.title}
          </p>
          <p className="text-sm text-muted">
            {formatDay(rental.startDate)} · {rental.days} {rental.days === 1 ? "day" : "days"} · {formatMoney(rental.totalCents)}
          </p>
        </div>
      </Link>
      {rental.note && <p className="mt-3 line-clamp-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">“{rental.note}”</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" disabled={pending} onClick={() => answer(false)}>
          Decline
        </Button>
        <Button size="sm" className="flex-1" loading={pending} onClick={() => answer(true)}>
          Accept
        </Button>
      </div>
    </div>
  );
}
