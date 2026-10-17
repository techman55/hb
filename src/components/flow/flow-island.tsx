"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronLeft, LoaderCircle, X } from "lucide-react";

/**
 * The floating "island" that tracks progress through the listing flow. It stays pinned at the
 * top on every step; the round button beside it only appears when the step can move forward.
 */
export function FlowIsland({
  label,
  progress,
  onBack,
  onClose,
  next,
}: {
  label: string;
  progress: number;
  onBack?: () => void;
  onClose: () => void;
  next?: { onClick: () => void; busy?: boolean; label?: string } | null;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-safe">
      <div className="mt-2 flex items-center gap-2">
        <motion.div
          layout
          className="pointer-events-auto flex h-11 w-[min(72vw,320px)] items-center gap-1 overflow-hidden rounded-full bg-[#0B0B0F] pl-1 pr-3 text-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
        >
          <button
            onClick={onBack ?? onClose}
            aria-label={onBack ? "Back" : "Close"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {onBack ? <ChevronLeft className="size-5" /> : <X className="size-[18px]" />}
          </button>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="truncate text-[13px] font-semibold leading-none"
              >
                {label}
              </motion.p>
            </AnimatePresence>
            <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/15">
              <motion.div
                className="h-full rounded-full bg-white"
                initial={false}
                animate={{ width: `${Math.round(Math.max(0.04, Math.min(1, progress)) * 100)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
              />
            </div>
          </div>
          {onBack && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </motion.div>
        <AnimatePresence>
          {next && (
            <motion.button
              key="next"
              initial={{ opacity: 0, scale: 0.6, x: -12 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.6, x: -12 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              onClick={next.onClick}
              disabled={next.busy}
              aria-label={next.label ?? "Next"}
              className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-white text-[#0B0B0F] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] ring-1 ring-black/10 transition active:scale-95"
            >
              {next.busy ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowRight className="size-5" strokeWidth={2.4} />}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
