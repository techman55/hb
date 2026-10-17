"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Globe,
  GraduationCap,
  Images,
  Inbox,
  LayoutGrid,
  Package,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

export type AdminCounts = { photos: number; appeals: number };

const TABS: { href: string; label: string; icon: LucideIcon; count?: keyof AdminCounts }[] = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/photos", label: "Photo review", icon: Images, count: "photos" },
  { href: "/admin/appeals", label: "Appeals", icon: Inbox, count: "appeals" },
  { href: "/admin/domains", label: "Domains", icon: Globe },
  { href: "/admin/schools", label: "Schools", icon: GraduationCap },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/listings", label: "Listings", icon: Package },
  { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
];

const isActive = (path: string, href: string) =>
  href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`);

function Count({ n, active }: { n: number; active?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5",
        active ? "bg-ink-inverse/20 text-current" : "bg-accent text-accent-ink",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AdminSideNav({ counts }: { counts: AdminCounts }) {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line px-4 py-6 lg:flex">
      <div className="flex items-center gap-2 px-3">
        <Wordmark />
        <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-inverse">Admin</span>
      </div>
      <nav aria-label="Admin" className="mt-8 flex flex-col gap-1">
        {TABS.map(({ href, label, icon: Icon, count }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium transition",
                active ? "bg-surface font-semibold text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-surface/60 hover:text-ink",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.3 : 1.9} />
              {label}
              {count && <Count n={counts[count]} />}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/"
        className="mt-auto flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-surface/60 hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back to app
      </Link>
    </aside>
  );
}

export function AdminTopBar({ counts }: { counts: AdminCounts }) {
  const path = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the current tab visible when the row is wider than the screen.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 pt-safe backdrop-blur-xl lg:hidden">
      <div className="flex h-12 items-center gap-2 px-4">
        <Link href="/" aria-label="Back to app" className="-ml-2 flex size-9 items-center justify-center rounded-full hover:bg-surface-2">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="font-bold tracking-tight">Admin</span>
      </div>
      <nav aria-label="Admin" className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
        {TABS.map(({ href, label, count }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                active ? "bg-ink text-ink-inverse" : "bg-surface text-muted ring-1 ring-line hover:text-ink",
              )}
            >
              {label}
              {count && <Count n={counts[count]} active={active} />}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
