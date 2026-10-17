// Small presentational pieces shared by the admin pages. No hooks, so server and client can use them.

import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SelectField({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <Select className="pr-10" {...props} />
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

/** A native checkbox drawn as a switch, so it works inside plain forms. */
export function Toggle({ label, className, ...props }: Omit<React.ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-3 text-sm font-medium", className)}>
      <span className="relative inline-flex">
        <input type="checkbox" className="peer sr-only" {...props} />
        <span className="h-7 w-12 rounded-full bg-line transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-surface shadow transition peer-checked:translate-x-5" />
      </span>
      {label}
    </label>
  );
}

export function SearchBar({
  placeholder,
  defaultValue,
  hidden,
}: {
  placeholder: string;
  defaultValue?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form role="search" className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input name="q" type="search" aria-label={placeholder} placeholder={placeholder} defaultValue={defaultValue} className="h-11 pl-10" />
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
    </form>
  );
}

export function FilterChips({ items }: { items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
            i.active ? "bg-ink text-ink-inverse" : "bg-surface text-muted ring-1 ring-line hover:text-ink",
          )}
        >
          {i.label}
          {i.count != null && <span className="text-xs opacity-70">{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  const cls = "block rounded-3xl border border-line bg-surface p-4 sm:p-5";
  return href ? (
    <Link href={href} className={cn(cls, "transition hover:border-ink/30")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 100;
  const tone = pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warn" : "bg-success";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">
          {used.toLocaleString()} / {cap.toLocaleString()}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Math.min(used, cap)}
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Banner({ tone = "warn", title, children }: { tone?: "warn" | "danger"; title: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3 text-sm", tone === "warn" ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-0.5 opacity-90">{children}</div>}
    </div>
  );
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
