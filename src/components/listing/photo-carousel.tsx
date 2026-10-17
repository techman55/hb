"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhotoCarousel({ photos, className }: { photos: { id: string; url: string | null }[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" });

  if (!photos.length) {
    return (
      <div className={cn("flex aspect-square items-center justify-center rounded-[28px] bg-surface-2 text-muted", className)}>
        <ImageOff className="size-8" />
      </div>
    );
  }

  return (
    <div className={cn("group relative overflow-hidden rounded-[28px] bg-surface-2", className)}>
      <div ref={ref} className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto">
        {photos.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={p.url ?? ""} alt={`Photo ${i + 1} of ${photos.length}`} className="size-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => go(i)}
                aria-label={`Show photo ${i + 1}`}
                className={cn("h-1.5 rounded-full bg-white/90 shadow transition-all", i === index ? "w-5" : "w-1.5 opacity-60")}
              />
            ))}
          </div>
          <button
            onClick={() => go(Math.max(0, index - 1))}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0B0B0F] opacity-0 shadow transition group-hover:opacity-100 sm:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => go(Math.min(photos.length - 1, index + 1))}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0B0B0F] opacity-0 shadow transition group-hover:opacity-100 sm:flex"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}

export function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180;
  return (
    <div>
      <p className={cn("whitespace-pre-line text-[15px] leading-relaxed", !open && long && "line-clamp-3")}>{text}</p>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-sm font-semibold underline-offset-4 hover:underline">
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
