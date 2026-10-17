import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  email,
  src,
  size = 40,
  className,
}: {
  name?: string | null;
  email?: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      style={style}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold tracking-tight text-ink-inverse",
        className,
      )}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: "neutral" | "accent" | "success" | "warn" | "danger" | "ink" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    ink: "bg-ink text-ink-inverse",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-3xl border border-line bg-surface", className)} {...props} />;
}

export function SectionTitle({
  children,
  count,
  action,
  className,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
        {children}
        {count != null && count > 0 && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("select-none text-[26px] font-black leading-none tracking-[-0.06em]", className)}>
      dibs<span className="text-accent">.</span>
    </span>
  );
}
