"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Inbox, Plus, Search, Shield, Store, Ticket } from "lucide-react";
import { Avatar, Wordmark } from "@/components/ui/bits";
import { SchoolLogo, type SchoolLike } from "@/components/school-chip";
import { cn } from "@/lib/utils";
import { useUnread } from "./unread";

export type ShellUser = { name: string | null; email: string; isAdmin: boolean };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

function Dot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-bg">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function BottomNav({ user, badges }: { user: ShellUser; badges: { dibs: number; lending: number } }) {
  const path = usePathname();
  const tab = (href: string, label: string, icon: React.ReactNode, count = 0) => (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 pt-2 text-[11px] font-medium transition",
        isActive(path, href) ? "text-ink" : "text-muted",
      )}
    >
      <span className="relative">
        {icon}
        <Dot count={count} />
      </span>
      {label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-safe backdrop-blur-xl lg:hidden">
      {/* Fixed 52px row: bars that sit on top of the nav (listing page) are positioned from this height plus .pb-safe. */}
      <div className="mx-auto flex h-[52px] max-w-md items-end">
        {tab("/", "Home", <House className="size-[22px]" strokeWidth={isActive(path, "/") ? 2.4 : 1.8} />)}
        {tab("/lending", "Lending", <Store className="size-[22px]" strokeWidth={isActive(path, "/lending") ? 2.4 : 1.8} />, badges.lending)}
        <div className="flex flex-1 justify-center">
          <Link
            href="/lending/new"
            aria-label="New listing"
            className="-mt-5 flex size-14 items-center justify-center rounded-full bg-ink text-ink-inverse shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.4} />
          </Link>
        </div>
        {tab("/dibs", "My Dibs", <Ticket className="size-[22px]" strokeWidth={isActive(path, "/dibs") ? 2.4 : 1.8} />, badges.dibs)}
        <Link
          href="/me"
          className={cn("flex flex-1 flex-col items-center gap-1 pt-2 text-[11px] font-medium", isActive(path, "/me") ? "text-ink" : "text-muted")}
        >
          <Avatar name={user.name} email={user.email} size={24} className={cn(isActive(path, "/me") && "ring-2 ring-ink ring-offset-2 ring-offset-surface")} />
          Me
        </Link>
      </div>
    </nav>
  );
}

export function TopBar({ school }: { school: SchoolLike }) {
  const { inbox } = useUnread();
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 pt-safe backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex h-12 max-w-[680px] items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Wordmark className="text-[22px]" />
        </Link>
        <SchoolLogo school={school} size={22} />
        <div className="ml-auto flex items-center gap-1">
          <Link href="/search" aria-label="Search" className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2">
            <Search className="size-[21px]" />
          </Link>
          <Link href="/inbox" aria-label="Inbox" className="relative flex size-10 items-center justify-center rounded-full hover:bg-surface-2">
            <Inbox className="size-[21px]" />
            <span className="absolute right-1.5 top-1.5">
              <Dot count={inbox} />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SideNav({
  user,
  school,
  badges,
}: {
  user: ShellUser;
  school: SchoolLike & { name: string };
  badges: { dibs: number; lending: number };
}) {
  const path = usePathname();
  const { inbox } = useUnread();
  const item = (href: string, label: string, Icon: typeof House, count = 0) => {
    const active = isActive(path, href);
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium transition",
          active ? "bg-surface font-semibold text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-surface/60 hover:text-ink",
        )}
      >
        <span className="relative">
          <Icon className="size-5" strokeWidth={active ? 2.3 : 1.9} />
          <Dot count={count} />
        </span>
        {label}
      </Link>
    );
  };
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line px-4 py-6 lg:flex">
      <Link href="/" className="px-3">
        <Wordmark />
      </Link>
      <Link
        href="/lending/new"
        className="mt-6 flex h-12 items-center justify-center gap-2 rounded-full bg-ink font-semibold text-ink-inverse transition hover:opacity-90"
      >
        <Plus className="size-5" /> New listing
      </Link>
      <nav className="mt-6 flex flex-col gap-1">
        {item("/", "Home", House)}
        {item("/search", "Search", Search)}
        {item("/lending", "Lending", Store, badges.lending)}
        {item("/dibs", "My Dibs", Ticket, badges.dibs)}
        {item("/inbox", "Inbox", Inbox, inbox)}
        {user.isAdmin && item("/admin", "Admin", Shield)}
      </nav>
      <Link
        href="/me"
        className={cn(
          "mt-auto flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-surface/60",
          isActive(path, "/me") && "bg-surface ring-1 ring-line",
        )}
      >
        <Avatar name={user.name} email={user.email} size={38} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user.name ?? user.email}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted">
            <SchoolLogo school={school} size={14} />
            {school.name}
          </p>
        </div>
      </Link>
    </aside>
  );
}
