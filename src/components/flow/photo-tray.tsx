"use client";

import { Star, TriangleAlert, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { LocalPhoto } from "./types";

function Ring({ progress }: { progress: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="size-10 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  );
}

export function PhotoTray({
  open,
  onOpenChange,
  photos,
  onRemove,
  onCover,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: LocalPhoto[];
  onRemove: (key: string) => void;
  onCover: (key: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`Your photos (${photos.length})`} description="The first photo is the cover.">
      <div className="grid grid-cols-3 gap-2 pb-2">
        {photos.map((p, i) => (
          <div key={p.key} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt="" className={cn("size-full object-cover", p.status !== "uploaded" && "opacity-60")} />
            {p.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                <Ring progress={p.progress} />
              </div>
            )}
            {p.status === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 px-2 text-center text-[11px] font-medium text-white">
                <TriangleAlert className="size-4" />
                {p.error ?? "Upload failed"}
              </div>
            )}
            {i === 0 ? (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">Cover</span>
            ) : (
              p.status === "uploaded" && (
                <button
                  onClick={() => onCover(p.key)}
                  aria-label="Make cover photo"
                  className="absolute left-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <Star className="size-3.5" />
                </button>
              )
            )}
            <button
              onClick={() => onRemove(p.key)}
              aria-label="Remove photo"
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
