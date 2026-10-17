"use client";

import { createContext, use, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import type { ActionResult } from "@/lib/admin";

type ButtonProps = React.ComponentProps<typeof Button>;

/** Runs a server action and reports the outcome as a toast. Unexpected throws become a toast too. */
export async function runAction<T extends ActionResult>(fn: () => Promise<T>): Promise<T | null> {
  try {
    const res = await fn();
    if (res.ok) toast.success(res.message ?? "Done");
    else toast.error(res.error);
    return res;
  } catch (err) {
    console.error(err);
    toast.error("Something went wrong. Try again.");
    return null;
  }
}

/** A button bound to one server action, e.g. `action={banUser.bind(null, id)}`. */
export function ActionButton({
  action,
  confirm,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "loading"> & { action: () => Promise<ActionResult>; confirm?: string }) {
  const [pending, start] = useTransition();
  const ask = useConfirm();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      {...props}
      loading={pending}
      onClick={() => {
        if (!confirm) {
          start(async () => {
            await runAction(action);
          });
          return;
        }
        // "Ban x? They'll be signed out." → title "Ban x?" with the rest underneath.
        const split = confirm.indexOf("? ");
        void ask({
          title: split > 0 ? confirm.slice(0, split + 1) : confirm,
          description: split > 0 ? confirm.slice(split + 2) : undefined,
          confirmLabel: typeof children === "string" ? children : "Confirm",
          tone: props.variant === "danger" || /^(remove|ban|delete)\b/i.test(confirm) ? "danger" : "default",
          action: async () => {
            const res = await action();
            if (!res.ok) return res.error;
            toast.success(res.message ?? "Done");
          },
        });
      }}
    >
      {children}
    </Button>
  );
}

const PendingContext = createContext(false);

/**
 * A form that posts its FormData to a server action and toasts the result. Submitting through
 * onSubmit (not `action=`) keeps what the admin typed when validation fails.
 */
export function ActionForm({
  action,
  resetOnSuccess,
  className,
  children,
}: {
  action: (data: FormData) => Promise<ActionResult>;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        start(async () => {
          const res = await runAction(() => action(data));
          if (res?.ok && resetOnSuccess) form.reset();
        });
      }}
    >
      <PendingContext value={pending}>{children}</PendingContext>
    </form>
  );
}

export function SubmitButton(props: Omit<ButtonProps, "type" | "loading">) {
  const pending = use(PendingContext);
  return <Button size="sm" {...props} type="submit" loading={pending} />;
}
