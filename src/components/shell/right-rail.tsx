import Link from "next/link";
import { CalendarClock, UserPlus } from "lucide-react";
import { formatDay, relativeDay } from "@/lib/dates";
import type { Handoff } from "@/lib/shell";

export function RightRail({ upcoming, friendRequests }: { upcoming: Handoff[]; friendRequests: number }) {
  return (
    <aside className="fixed inset-y-0 right-0 hidden w-80 flex-col gap-6 overflow-y-auto border-l border-line px-5 py-6 xl:flex">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
          <CalendarClock className="size-4" /> Coming up
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-5 text-sm text-muted ring-1 ring-line">
            Pickups and returns show up here once a dibs is accepted.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((h) => (
              <li key={`${h.rentalId}-${h.kind}`}>
                <Link
                  href={h.role === "owner" ? `/lending/rentals/${h.rentalId}` : `/dibs/${h.rentalId}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 ring-1 ring-line transition hover:ring-ink/30"
                >
                  {h.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.coverUrl} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="size-12 shrink-0 rounded-xl bg-surface-2" />
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold">{h.title}</p>
                    <p className="truncate text-muted">
                      {h.kind === "pickup" ? "Pickup" : "Return"} {relativeDay(h.date)} · {formatDay(h.date)}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {h.role === "owner" ? "with" : "from"} {h.otherName ?? "a student"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {friendRequests > 0 && (
        <Link href="/me#friends" className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">
          <UserPlus className="size-4" />
          {friendRequests === 1 ? "1 friend request" : `${friendRequests} friend requests`}
        </Link>
      )}
    </aside>
  );
}
