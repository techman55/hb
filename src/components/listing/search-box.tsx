"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";

const DEBOUNCE_MS = 250;

/** Searches as you type: the query lands in the URL, so results are shareable and Back works. */
export function SearchBox({ initial, autoFocus }: { initial: string; autoFocus?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const push = (q: string) => {
    const next = new URLSearchParams(params.toString());
    const trimmed = q.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    if ((params.get("q") ?? "") === trimmed) return;
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const change = (q: string) => {
    setValue(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push(q), DEBOUNCE_MS);
  };

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        push(value);
        input.current?.blur(); // closes the keyboard on phones
      }}
    >
      {pending ? (
        <LoaderCircle className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted" />
      ) : (
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
      )}
      <input
        ref={input}
        type="search"
        name="q"
        value={value}
        onChange={(e) => change(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Search calculators, textbooks, gear…"
        aria-label="Search listings"
        className="h-12 w-full rounded-full border border-line bg-surface pl-12 pr-12 text-base outline-none focus:border-ink [&::-webkit-search-cancel-button]:hidden"
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            change("");
            input.current?.focus();
          }}
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
    </form>
  );
}
