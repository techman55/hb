"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /**
   * Runs while the sheet stays open with a spinner on the confirm button. Return an error
   * message to show it inline and keep the sheet open; return nothing to close.
   */
  action?: () => Promise<string | null | void>;
};

type Ask = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * Replaces `window.confirm` with a sheet that matches the app: bottom sheet on phones, centered
 * dialog from `sm` up. Resolves true once confirmed (and once `action` succeeds, if given).
 */
export function useConfirm(): Ask {
  const ask = use(ConfirmContext);
  if (!ask) throw new Error("useConfirm needs <ConfirmProvider> above it");
  return ask;
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const settled = useRef(false);

  const ask = useCallback<Ask>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        settled.current = false;
        setError(null);
        setRequest({ ...opts, resolve });
        setOpen(true);
      }),
    [],
  );

  const finish = useCallback(
    (ok: boolean) => {
      if (request && !settled.current) {
        settled.current = true;
        request.resolve(ok);
      }
      setOpen(false);
    },
    [request],
  );

  // An action that redirects (e.g. removing a listing) navigates away; close instead of spinning.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (request && !settled.current) {
      settled.current = true;
      request.resolve(true);
    }
    setOpen(false);
  }, [pathname, request]);

  const confirm = () => {
    if (!request?.action) return finish(true);
    const action = request.action;
    setError(null);
    start(async () => {
      try {
        const err = await action();
        if (err) setError(err);
        else finish(true);
      } catch (e) {
        console.error(e);
        setError("Something went wrong. Try again.");
      }
    });
  };

  const danger = (request?.tone ?? "danger") === "danger";

  return (
    <ConfirmContext value={ask}>
      {children}
      <AlertDialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) finish(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            className="dialog-overlay fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
            onClick={() => !pending && finish(false)}
          />
          <AlertDialog.Content
            className={cn(
              "dialog-panel fixed inset-x-0 bottom-0 z-[60] rounded-t-[28px] bg-surface px-5 pt-3 pb-safe shadow-2xl outline-none",
              "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:p-6",
            )}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex flex-col items-center text-center">
              {danger && (
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <TriangleAlert className="size-6" />
                </div>
              )}
              <AlertDialog.Title className="text-lg font-bold tracking-tight text-balance">{request?.title}</AlertDialog.Title>
              {request?.description ? (
                <AlertDialog.Description className="mt-1.5 text-[15px] leading-snug text-muted text-pretty">
                  {request.description}
                </AlertDialog.Description>
              ) : (
                <AlertDialog.Description className="sr-only">{request?.title}</AlertDialog.Description>
              )}
              {error && (
                <p role="alert" className="mt-3 w-full rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
                  {error}
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-col gap-2 pb-4 sm:flex-row-reverse sm:pb-0">
              <Button
                size="lg"
                variant={danger ? "danger" : "primary"}
                className="w-full sm:flex-1"
                loading={pending}
                onClick={confirm}
              >
                {request?.confirmLabel}
              </Button>
              <AlertDialog.Cancel asChild>
                <Button size="lg" variant="soft" className="w-full sm:flex-1" disabled={pending}>
                  {request?.cancelLabel ?? "Never mind"}
                </Button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext>
  );
}
