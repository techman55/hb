import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-muted/70 focus:border-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:border-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />;
}

export function Hint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mt-1.5 text-[13px] leading-snug text-muted", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full appearance-none rounded-2xl border border-line bg-surface px-4 text-base text-ink outline-none focus:border-ink",
        className,
      )}
      {...props}
    />
  );
}
