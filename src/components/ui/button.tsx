import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        primary: "bg-ink text-ink-inverse hover:opacity-90",
        accent: "bg-accent text-accent-ink hover:brightness-110 shadow-[0_8px_24px_-8px_var(--accent)]",
        secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
        soft: "bg-surface-2 text-ink hover:bg-line",
        ghost: "text-ink hover:bg-surface-2",
        danger: "bg-danger text-white hover:opacity-90",
        link: "rounded-md px-0 text-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[15px]",
        lg: "h-14 px-7 text-base",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: Props) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}
