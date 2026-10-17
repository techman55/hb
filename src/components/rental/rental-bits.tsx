import Link from "next/link";
import { Badge } from "@/components/ui/bits";
import { diffDays, formatDay, todayISO } from "@/lib/dates";
import type { RentalCardData } from "@/lib/listings/lending";
import { cn, formatMoney, plural } from "@/lib/utils";

/** "Pickup in 2 days", "Due back today", "Overdue by 1 day"… with a tone for the badge. */
export function rentalTiming(
  r: Pick<RentalCardData, "status" | "startDate" | "dueDate">,
  role: "owner" | "renter" = "owner",
  today = todayISO(),
) {
  if (r.status === "requested" && role === "renter") return { label: "Waiting on the owner", tone: "accent" as const };
  if (r.status === "requested") {
    const n = diffDays(today, r.startDate);
    return { label: n <= 0 ? "Wants it today" : `Wants it in ${plural(n, "day")}`, tone: "accent" as const };
  }
  if (r.status === "accepted") {
    const n = diffDays(today, r.startDate);
    if (n < 0) return { label: "Pickup missed", tone: "danger" as const };
    if (n === 0) return { label: "Pickup today", tone: "accent" as const };
    if (n === 1) return { label: "Pickup tomorrow", tone: "accent" as const };
    return { label: `Pickup in ${n} days`, tone: "neutral" as const };
  }
  if (r.status === "active") {
    const n = diffDays(today, r.dueDate);
    if (n < 0) return { label: `Overdue by ${plural(-n, "day")}`, tone: "danger" as const };
    if (n === 0) return { label: "Due back today", tone: "warn" as const };
    return { label: `Due back in ${plural(n, "day")}`, tone: "success" as const };
  }
  const labels: Record<string, string> = { returned: "Returned", declined: "Declined", cancelled: "Cancelled", expired: "Expired" };
  return { label: labels[r.status] ?? r.status, tone: "neutral" as const };
}

export function RentalRow({ rental, href, role }: { rental: RentalCardData; href: string; role: "owner" | "renter" }) {
  const t = rentalTiming(rental, role);
  return (
    <Link href={href} className="flex items-center gap-3 rounded-3xl bg-surface p-3 ring-1 ring-line transition hover:ring-ink/30">
      {rental.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rental.coverUrl} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span className="size-16 shrink-0 rounded-2xl bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{rental.title}</p>
        <p className="truncate text-sm text-muted">
          {role === "owner" ? (rental.otherName ?? "A student") : `from ${rental.otherName ?? "a student"}`} ·{" "}
          {formatDay(rental.startDate, { month: "short", day: "numeric" })}–{formatDay(rental.dueDate, { month: "short", day: "numeric" })} ·{" "}
          {formatMoney(rental.totalCents)}
        </p>
        <Badge tone={t.tone} className="mt-1.5">
          {t.label}
        </Badge>
      </div>
    </Link>
  );
}

export function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn("shrink-0 rounded-2xl object-cover", className)} />
  ) : (
    <span className={cn("shrink-0 rounded-2xl bg-surface-2", className)} />
  );
}
