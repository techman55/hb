"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORIES, CONDITION_LABELS } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { Details } from "./types";

function AutoTextarea({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "onChange"> & { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("ghost-input block w-full resize-none overflow-hidden", className)}
      {...props}
    />
  );
}

function ChipList({
  items,
  onChange,
  placeholder,
  max,
  maxLength,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  max: number;
  maxLength: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v) && items.length < max) onChange([...items, v.slice(0, maxLength)]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((t) => (
        <span key={t} className="inline-flex h-8 items-center gap-1 rounded-full bg-surface-2 pl-3 pr-1.5 text-sm font-medium">
          {t}
          <button onClick={() => onChange(items.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="rounded-full p-0.5 text-muted hover:bg-line hover:text-ink">
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {items.length < max && (
        <span className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line pl-2.5 pr-1">
          <Plus className="size-3.5 text-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder={placeholder}
            maxLength={maxLength}
            className="w-28 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </span>
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {children}
      {hint && <p className="mt-2 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

/**
 * One editor for both paths. In AI mode the fields arrive filled and read like a finished listing,
 * but every word is editable in place. In manual mode they start empty with guidance.
 */
export function ListingEditor({
  value,
  onChange,
  mode,
  photoUrl,
}: {
  value: Details;
  onChange: (d: Details) => void;
  mode: "ai" | "manual";
  photoUrl?: string | null;
}) {
  const set = <K extends keyof Details>(k: K, v: Details[K]) => onChange({ ...value, [k]: v });
  const manual = mode === "manual";
  return (
    <div className="rounded-[28px] bg-surface p-5 ring-1 ring-line sm:p-6">
      <div className="flex items-start gap-4">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="size-20 shrink-0 rounded-2xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          {!manual && (
            <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
              <Sparkles className="size-3.5" /> Written for you. Tap anything to edit
            </span>
          )}
          {manual && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Title</p>}
          <AutoTextarea
            value={value.title}
            onChange={(v) => set("title", v.replace(/\n/g, " "))}
            maxLength={60}
            placeholder="What is it? e.g. TI-84 Plus CE calculator"
            className="-mx-2 px-2 py-1 text-[22px] font-bold leading-snug tracking-tight placeholder:font-semibold placeholder:text-muted/60"
            aria-label="Title"
          />
          {manual && <p className="mt-1 text-[13px] text-muted">Brand and model help people find it. {60 - value.title.length} characters left.</p>}
        </div>
      </div>

      <div className="mt-4">
        <Row label="Description" hint={manual ? "Condition, what's included, anything a renter should know. A few sentences is plenty." : undefined}>
          <AutoTextarea
            value={value.description}
            onChange={(v) => set("description", v)}
            maxLength={600}
            placeholder="e.g. Works great, a few scuffs on the back. Comes with the charging cable."
            className="-mx-2 px-2 py-1 text-[15px] leading-relaxed placeholder:text-muted/60"
            aria-label="Description"
          />
        </Row>

        <Row label="Category">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => set("category", c.slug)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition",
                  value.category === c.slug ? "bg-ink text-ink-inverse" : "bg-surface-2 hover:bg-line",
                )}
              >
                <CategoryIcon slug={c.slug} className="size-4" />
                {c.name}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Condition">
          <div className="grid grid-cols-4 gap-1 rounded-full bg-surface-2 p-1">
            {(Object.keys(CONDITION_LABELS) as Details["condition"][]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("condition", k)}
                className={cn(
                  "h-9 rounded-full text-sm font-semibold transition",
                  value.condition === k ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
                )}
              >
                {CONDITION_LABELS[k]}
              </button>
            ))}
          </div>
        </Row>

        <Row label="What's included" hint={manual ? "Chargers, cases, cables. Press Enter after each one." : undefined}>
          <ChipList items={value.included} onChange={(v) => set("included", v)} placeholder="Add item" max={5} maxLength={40} />
        </Row>

        <Row label="Tags" hint={manual ? "Words people might search for, like Calculator or Graphing." : undefined}>
          <ChipList items={value.tags} onChange={(v) => set("tags", v)} placeholder="Add tag" max={6} maxLength={24} />
        </Row>
      </div>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="rounded-[28px] bg-surface p-6 ring-1 ring-line">
      <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
        <Sparkles className="size-3.5 animate-pulse" /> Writing your listing…
      </span>
      <div className="skeleton h-7 w-3/4 rounded-lg" />
      <div className="mt-6 space-y-2">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-11/12 rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
      </div>
      <div className="mt-6 flex gap-2">
        {[80, 96, 72, 88].map((w) => (
          <div key={w} className="skeleton h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}
