"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { addDays, formatDay } from "@/lib/dates";
import { cn, formatMoney } from "@/lib/utils";
import { callDibs } from "@/app/actions/rentals";

const WINDOW = 21;

export function DibsButton({
  listingId,
  title,
  priceCents,
  maxDays,
  booked,
  today,
  ownerFirstName,
}: {
  listingId: string;
  title: string;
  priceCents: number;
  maxDays: number;
  booked: { startDate: string; days: number }[];
  today: string;
  ownerFirstName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const blocked = useMemo(() => {
    const set = new Set<string>();
    for (const b of booked) for (let i = 0; i < b.days; i++) set.add(addDays(b.startDate, i));
    return set;
  }, [booked]);
  const dates = useMemo(() => Array.from({ length: WINDOW }, (_, i) => addDays(today, i)), [today]);
  const [startDate, setStartDate] = useState(() => dates.find((d) => !blocked.has(d)) ?? dates[0]);
  const [days, setDays] = useState(1);
  const [note, setNote] = useState("");

  // How long a rental can run from the chosen day before it hits someone else's booking.
  const limit = useMemo(() => {
    let n = 0;
    while (n < maxDays && !blocked.has(addDays(startDate, n))) n++;
    return Math.max(1, n);
  }, [startDate, blocked, maxDays]);
  const d = Math.min(days, limit);

  const submit = () =>
    start(async () => {
      const res = await callDibs({ listingId, startDate, days: d, note: note.trim() || undefined });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Dibs sent to ${ownerFirstName}`);
      setOpen(false);
      router.push(`/dibs/${res.rentalId}`);
    });

  return (
    <>
      <Button size="lg" className="flex-1 sm:flex-none sm:px-10" onClick={() => setOpen(true)}>
        <Hand className="size-5" /> Call dibs
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Call dibs on ${title}`} description={`${ownerFirstName} confirms before it's yours.`}>
        <p className="mb-2 text-sm font-semibold">Pickup day</p>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {dates.map((date) => {
            const taken = blocked.has(date);
            const active = date === startDate;
            return (
              <button
                key={date}
                disabled={taken}
                onClick={() => setStartDate(date)}
                className={cn(
                  "flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 text-center transition disabled:opacity-30",
                  active ? "bg-ink text-ink-inverse" : "bg-surface-2 hover:bg-line",
                )}
              >
                <span className="text-[11px] font-medium uppercase opacity-70">{formatDay(date, { weekday: "short" })}</span>
                <span className="text-lg font-bold">{formatDay(date, { day: "numeric" })}</span>
                <span className="text-[10px] opacity-70">{formatDay(date, { month: "short" })}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <p className="text-sm font-semibold">How long</p>
          <p className="font-bold tabular-nums">{d === 1 ? "1 day" : `${d} days`}</p>
        </div>
        {limit > 1 ? (
          <input
            type="range"
            min={1}
            max={limit}
            value={d}
            onChange={(e) => setDays(Number(e.target.value))}
            className="dibs-range mt-3 w-full"
            style={{ ["--fill" as string]: `${limit > 1 ? ((d - 1) / (limit - 1)) * 100 : 100}%` }}
            aria-label="Number of days"
          />
        ) : (
          <p className="mt-2 text-sm text-muted">Only 1 day is open from this date.</p>
        )}
        <p className="mt-2 text-sm text-muted">
          Back by {formatDay(addDays(startDate, d))}
        </p>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder={`Add a note for ${ownerFirstName} (optional)`}
          className="mt-5 min-h-20"
        />

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-muted">
            {formatMoney(priceCents)} × {d} {d === 1 ? "day" : "days"}
          </span>
          <span className="text-lg font-bold">{formatMoney(priceCents * d)}</span>
        </div>
        <p className="mt-2 text-xs text-muted">You pay {ownerFirstName} in person at pickup.</p>
        <Button size="lg" className="mt-5 w-full" loading={pending} onClick={submit}>
          Send dibs
        </Button>
      </Sheet>
    </>
  );
}
