"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

function useParamHref() {
  const path = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${path}?${qs}` : path;
  };
}

export function CategoryChips({ active }: { active: string | null }) {
  const href = useParamHref();
  const chip = (slug: string | null, label: string) => (
    <Link
      key={slug ?? "all"}
      href={href({ cat: slug })}
      scroll={false}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition",
        active === slug ? "bg-ink text-ink-inverse" : "bg-surface text-ink ring-1 ring-line hover:ring-ink/30",
      )}
    >
      {slug && <CategoryIcon slug={slug} className="size-4" />}
      {label}
    </Link>
  );
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:-mx-6 lg:px-6">
      {chip(null, "All")}
      {CATEGORIES.map((c) => chip(c.slug, c.name))}
    </div>
  );
}

export function CampusToggle({ onlyMine, schoolShortName }: { onlyMine: boolean; schoolShortName: string }) {
  const router = useRouter();
  const href = useParamHref();
  const [pending, start] = useTransition();
  const flip = () => {
    const value = onlyMine ? "all" : "mine";
    document.cookie = `dibs_campus=${value}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.replace(href({ campus: value }), { scroll: false }));
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={onlyMine}
      onClick={flip}
      aria-label="Only my college"
      className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-medium sm:text-sm", pending && "opacity-60")}
    >
      <span className="hidden sm:inline">Only {schoolShortName}</span>
      <span className="sm:hidden">Only my college</span>
      <span className={cn("relative h-6 w-10 rounded-full transition", onlyMine ? "bg-ink" : "bg-line")}>
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all",
            onlyMine ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function FeedTabs({ tab }: { tab: "foryou" | "following" }) {
  const href = useParamHref();
  const item = (value: "foryou" | "following", label: string) => (
    <Link
      href={href({ tab: value === "foryou" ? null : value })}
      scroll={false}
      className={cn(
        "whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition sm:px-3.5 sm:text-sm",
        tab === value ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 p-1">
      {item("foryou", "For you")}
      {item("following", "Following")}
    </div>
  );
}
