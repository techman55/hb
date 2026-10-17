"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { answerDibs, cancelDibs } from "@/app/actions/rentals";
import { HandoffScanner } from "./scanner";

export function OwnerActions({ rentalId, status, renterName }: { rentalId: string; status: string; renterName: string }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [pending, start] = useTransition();
  const ask = useConfirm();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
    });

  return (
    <div className="flex flex-col gap-2">
      {status === "requested" && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={pending}
            onClick={() =>
              ask({
                title: "Decline this request?",
                description: `${renterName} will see that you can't do those dates.`,
                confirmLabel: "Decline",
                cancelLabel: "Go back",
                action: async () => {
                  const res = await answerDibs(rentalId, false);
                  return res.ok ? null : (res.error ?? "Something went wrong");
                },
              })
            }
          >
            Decline
          </Button>
          <Button size="lg" className="flex-1" loading={pending} onClick={() => run(() => answerDibs(rentalId, true))}>
            Accept
          </Button>
        </div>
      )}
      {(status === "accepted" || status === "active") && (
        <Button size="lg" className="w-full" onClick={() => setScanning(true)}>
          <ScanLine className="size-5" /> {status === "accepted" ? "Scan pickup code" : "Scan return code"}
        </Button>
      )}
      {status === "accepted" && (
        <Button
          variant="ghost"
          className="text-danger"
          disabled={pending}
          onClick={() =>
            ask({
              title: "Cancel this rental?",
              description: `${renterName} will be told in chat, and the dates open back up.`,
              confirmLabel: "Cancel rental",
              cancelLabel: "Keep it",
              action: async () => {
                const res = await cancelDibs(rentalId);
                return res.ok ? null : res.error;
              },
            })
          }
        >
          Cancel rental
        </Button>
      )}
      {scanning && (
        <HandoffScanner
          rentalId={rentalId}
          action={status === "accepted" ? "pickup" : "return"}
          renterName={renterName}
          onClose={() => setScanning(false)}
          onDone={() => {
            setScanning(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

export function RenterCancel({ rentalId, status }: { rentalId: string; status: string }) {
  const ask = useConfirm();
  if (status !== "requested" && status !== "accepted") return null;
  const withdrawing = status === "requested";
  return (
    <Button
      variant="ghost"
      className="w-full text-danger"
      onClick={() =>
        ask({
          title: withdrawing ? "Withdraw your dibs?" : "Cancel this rental?",
          description: withdrawing
            ? "Your request goes away and the owner gets a note in chat. You can call dibs again later."
            : "The owner already said yes, so let them know in chat if plans changed. The dates open back up for others.",
          confirmLabel: withdrawing ? "Withdraw" : "Cancel rental",
          cancelLabel: withdrawing ? "Keep my dibs" : "Keep it",
          action: async () => {
            const res = await cancelDibs(rentalId);
            return res.ok ? null : res.error;
          },
        })
      }
    >
      {status === "requested" ? "Withdraw dibs" : "Cancel rental"}
    </Button>
  );
}
