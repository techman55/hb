import { cn } from "@/lib/utils";

export type SchoolLike = { name: string; shortName: string; logoUrl: string | null; accent: string | null };

/** Round school logo with a monogram fallback tinted in the school's colour. */
export function SchoolLogo({ school, size = 24, className }: { school: SchoolLike; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (school.logoUrl) {
    return (
      <span style={style} className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={school.logoUrl} alt="" className="size-[86%] object-contain" />
      </span>
    );
  }
  return (
    <span
      style={{ ...style, background: school.accent ?? "var(--ink)", fontSize: Math.max(8, size * 0.36) }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", className)}
      aria-hidden
    >
      {school.shortName.slice(0, 3)}
    </span>
  );
}

export function SchoolChip({
  school,
  label,
  className,
}: {
  school: SchoolLike;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-xs font-semibold", className)}>
      <SchoolLogo school={school} size={20} />
      <span className="truncate">{label ?? school.shortName}</span>
    </span>
  );
}
