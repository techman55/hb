"use client";

import { cn } from "@/lib/utils";

/** One input that renders as six boxes. Plays well with paste and iOS/Android SMS autofill. */
export function CodeInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  length = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  length?: number;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">Verification code</span>
      <input
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, length);
          onChange(v);
          if (v.length === length) onComplete?.(v);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={length}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <span className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length }).map((_, i) => {
          const active = i === Math.min(value.length, length - 1);
          return (
            <span
              key={i}
              className={cn(
                "flex h-14 items-center justify-center rounded-2xl border bg-surface font-mono text-2xl font-semibold transition",
                active ? "border-ink" : "border-line",
              )}
            >
              {value[i] ?? ""}
            </span>
          );
        })}
      </span>
    </label>
  );
}
