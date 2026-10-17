"use client";

import { createContext, use, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      {...props}
      loading={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          await runAction(action);
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
