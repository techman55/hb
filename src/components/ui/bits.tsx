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

// The "Dibs" logotype, cropped to its glyphs. Sized by font-size (it is 0.9em tall) and painted
// with currentColor, so callers keep using text-* classes and it follows the theme.
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="286 657 1348 521"
      role="img"
      aria-label="Dibs"
      fill="currentColor"
      className={cn("block h-[0.9em] w-auto shrink-0 select-none text-[26px]", className)}
    >
      <path d="M700.36,1063.68c-22.18,32.5-49,57.93-80.48,76.3-31.49,18.38-65.63,27.56-102.42,27.56h-230.12c-.45-8.51.1-17.25,1.66-26.22,1.55-8.96,4.09-17.03,7.65-24.2h55.2l-8.65,4.71,79.81-398.63,7.98,4.71h-55.87c-.45-8.51.1-17.25,1.66-26.22,1.55-8.96,4.09-17.03,7.65-24.2h186.23c45.66,0,83.47,11.43,113.4,34.28,29.93,22.86,50.43,54.68,61.52,95.46,11.08,40.79,11.31,88.29.67,142.51-8.43,43.47-23.73,81.46-45.89,113.94ZM675.75,938.98c8.42-42.57,9.31-79.21,2.66-109.91-6.65-30.69-19.95-54.34-39.91-70.92-19.95-16.57-45.67-24.87-77.15-24.87h-81.14l9.98-6.05-77.82,390.57-5.98-6.05h115.06c23.94,0,46.33-7.28,67.17-21.85,20.84-14.56,38.91-34.84,54.2-60.84,15.3-25.99,26.27-56.02,32.92-90.08Z" />
      <path d="M818.08,823.35h105.08l-61.19,307.21-6.65-8.07h50.55c2.66,16.13-.45,31.15-9.31,45.04h-105.75l61.19-306.54,5.99,8.07h-49.22c-2.66-16.13.44-31.36,9.31-45.71ZM946.44,708.4c0,14.35-4.99,26.22-14.96,35.63-9.98,9.41-21.4,14.12-34.25,14.12-11.53,0-20.62-3.47-27.27-10.42-6.65-6.94-9.98-15.8-9.98-26.55,0-14.79,4.99-26.77,14.96-35.96,9.98-9.18,21.17-13.78,33.59-13.78,11.52,0,20.72,3.36,27.6,10.08,6.87,6.72,10.31,15.69,10.31,26.89Z" />
      <path d="M1261.36,1093.59c-16.63,26.45-36.25,46.95-58.86,61.51-22.61,14.56-47.22,21.85-73.83,21.85-24.84,0-45.01-6.84-60.52-20.5-15.53-13.67-26.39-32.6-32.59-56.8l13.3,1.34-30.59,66.55h-45.89l94.44-472.58,6.65,8.07h-49.88c-3.11-16.57-.23-31.59,8.65-45.04h105.75l-47.89,239.32-7.32-3.36c15.07-25.99,33.14-45.82,54.2-59.49,21.05-13.67,43.34-20.5,66.84-20.5,26.16,0,47.22,7.96,63.18,23.86,15.96,15.91,26.71,37.98,32.26,66.21,5.54,28.23,4.54,61.17-2.99,98.82-6.65,34.06-18.29,64.31-34.92,90.75ZM1232.76,931.25c-2.44-19.5-8.1-34.72-16.96-45.71-8.87-10.98-20.85-16.47-35.91-16.47-15.96,0-31.82,6.05-47.55,18.15-15.74,12.1-29.49,28.47-41.24,49.07-11.75,20.62-20.07,43.47-24.94,68.57-4.44,22.41-5.22,42.69-2.33,60.84,2.88,18.15,9.2,32.5,18.96,43.02,9.75,10.53,22.61,15.8,38.58,15.8s31.14-5.38,45.56-16.13c14.4-10.76,27.04-25.43,37.91-44.03,10.86-18.59,18.73-40,23.61-64.2,5.32-26.44,6.76-49.41,4.32-68.9Z" />
      <path d="M1388.72,1066.7c0,18.38,7.2,33.17,21.62,44.37,14.4,11.21,33.36,16.81,56.87,16.81,19.5,0,35.13-3.58,46.89-10.76,11.74-7.16,18.96-17.25,21.61-30.25,3.1-15.68.77-28.67-6.98-38.99-7.76-10.3-21.4-18.59-40.9-24.87l-47.22-15.46c-25.72-8.51-44.34-22.52-55.87-42.01-11.54-19.5-14.86-42.01-9.98-67.56,5.32-25.99,18.39-46.6,39.24-61.84,20.84-15.23,46.33-22.86,76.49-22.86,23.05,0,43.12,4.48,60.19,13.44,17.06,8.97,27.82,21.07,32.26,36.3l-3.33,4.03,7.98-42.35c7.09-3.13,14.4-4.71,21.95-4.71,8.87,0,16.63,1.8,23.28,5.38l-23.94,121c-5.32,2.69-12.86,4.03-22.61,4.03-7.98,0-15.74-1.57-23.28-4.71.88-7.61,1.66-14.22,2.33-19.83.67-5.6,1-9.52,1-11.76,0-17.92-5.99-31.82-17.96-41.68-11.97-9.85-28.38-14.79-49.21-14.79-17.29,0-31.82,4.03-43.56,12.1-11.75,8.07-19.07,18.82-21.95,32.27-2.89,13.44-.67,24.65,6.65,33.61,7.32,8.97,19.84,16.36,37.58,22.18l44.56,14.12c31.03,9.86,52.98,24.65,65.84,44.37,12.85,19.73,16.4,44.15,10.64,73.27-5.32,27.79-18.74,49.3-40.24,64.53-21.51,15.23-49.11,22.86-82.8,22.86-25.72,0-48.33-5.49-67.84-16.47-19.52-10.98-32.59-25.65-39.24-44.03l7.98-2.02-10.64,50.42c-6.21,3.13-13.75,4.71-22.61,4.71-7.54,0-14.86-1.58-21.95-4.71l26.6-130.41c7.98-2.69,15.3-4.03,21.95-4.03,7.98,0,15.73,1.58,23.28,4.71-1.78,7.63-2.99,13.56-3.66,17.81-.67,4.26-1,8.85-1,13.78Z" />
    </svg>
  );
}
