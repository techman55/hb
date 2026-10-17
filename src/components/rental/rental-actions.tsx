"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { answerDibs, cancelDibs } from "@/app/actions/rentals";
import { HandoffScanner } from "./scanner";

export function OwnerActions({
  rentalId,
  status,
  renterName,
  total,
  handles,
}: {
  rentalId: string;
  status: string;
  renterName: string;
  total: string;
  handles: string | null;
}) {
  const router = useRouter();
  // Locked when the scanner opens, so a refresh mid-scan (accepted → active) can't flip pickup into return.
  const [scanning, setScanning] = useState<"pickup" | "return" | null>(null);
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
        <Button
          size="lg"
          className="w-full"
          onClick={async () => {
            if (status === "active") return setScanning("return");
            // Payment comes first: once the pickup is scanned, the rental is on.
            const paid = await ask({
              title: `Did ${renterName} pay you ${total}?`,
              description: handles
                ? `If not, let them know they can pay you with ${handles} right now. Scan only once you have the money.`
                : "Collect payment before you scan. The scan confirms the pickup.",
              confirmLabel: "Yes, scan code",
              cancelLabel: "Not yet",
              tone: "default",
            });
            if (paid) setScanning("pickup");
          }}
        >
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
          action={scanning}
          renterName={renterName}
          onClose={() => setScanning(null)}
          onDone={() => {
            setScanning(null);
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
