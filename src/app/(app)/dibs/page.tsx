import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, QrCode, Ticket } from "lucide-react";
import { RentalRow } from "@/components/rental/rental-bits";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionTitle } from "@/components/ui/bits";
import { requireUser } from "@/lib/auth/current";
import { rentalsFor } from "@/lib/listings/lending";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "My Dibs" };

export default async function MyDibsPage() {
  const user = await requireUser();
  const all = await rentalsFor(db(), user.id, "renter", ["requested", "accepted", "active", "returned", "declined", "cancelled", "expired"]);
  const active = all.filter((r) => r.status === "active");
  const upcoming = all.filter((r) => r.status === "accepted");
  const requested = all.filter((r) => r.status === "requested");
  const past = all.filter((r) => !["active", "accepted", "requested"].includes(r.status)).reverse();
  const next = [...active, ...upcoming][0];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Dibs</h1>
        <p className="text-sm text-muted">Things you&apos;re renting</p>
      </div>

      {next && (
        <Link href={`/dibs/${next.id}`} className="flex items-center gap-4 rounded-[28px] bg-ink p-5 text-ink-inverse transition active:scale-[0.99]">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink-inverse/10">
            <QrCode className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{next.status === "accepted" ? "Show pickup code" : "Show return code"}</p>
            <p className="truncate text-sm opacity-70">{next.title}</p>
          </div>
          <ChevronRight className="size-5 opacity-70" />
        </Link>
      )}

      {active.length > 0 && (
        <section>
          <SectionTitle count={active.length}>With you now</SectionTitle>
          <div className="flex flex-col gap-2">
            {active.map((r) => (
              <RentalRow key={r.id} rental={r} role="renter" href={`/dibs/${r.id}`} />
            ))}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <SectionTitle count={upcoming.length}>Upcoming pickups</SectionTitle>
          <div className="flex flex-col gap-2">
            {upcoming.map((r) => (
              <RentalRow key={r.id} rental={r} role="renter" href={`/dibs/${r.id}`} />
            ))}
          </div>
        </section>
      )}
      {requested.length > 0 && (
        <section>
          <SectionTitle count={requested.length}>Waiting on the owner</SectionTitle>
          <div className="flex flex-col gap-2">
            {requested.map((r) => (
              <RentalRow key={r.id} rental={r} role="renter" href={`/dibs/${r.id}`} />
            ))}
          </div>
        </section>
      )}

      {!active.length && !upcoming.length && !requested.length && (
        <EmptyState
          icon={<Ticket className="size-8" />}
          title="No dibs yet"
          body="Find something you need for a day or a week and call dibs on it."
          action={
            <Button asChild>
              <Link href="/">Browse</Link>
            </Button>
          }
        />
      )}

      {past.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-semibold text-muted">
            Past ({past.length}) <ChevronRight className="size-4 transition group-open:rotate-90" />
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {past.map((r) => (
              <RentalRow key={r.id} rental={r} role="renter" href={`/dibs/${r.id}`} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
