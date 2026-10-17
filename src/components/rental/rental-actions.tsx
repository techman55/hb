"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { answerDibs, cancelDibs } from "@/app/actions/rentals";
import { HandoffScanner } from "./scanner";

export function OwnerActions({ rentalId, status, renterName }: { rentalId: string; status: string; renterName: string }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
    });

  return (
    <div className="flex flex-col gap-2">
      {status === "requested" && (
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" disabled={pending} onClick={() => run(() => answerDibs(rentalId, false))}>
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
        <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => confirm("Cancel this rental?") && run(() => cancelDibs(rentalId))}>
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
  const [pending, start] = useTransition();
  if (status !== "requested" && status !== "accepted") return null;
  return (
    <Button
      variant="ghost"
      className="w-full text-danger"
      disabled={pending}
      onClick={() => {
        if (!confirm(status === "requested" ? "Withdraw your dibs?" : "Cancel this rental?")) return;
        start(async () => {
          const res = await cancelDibs(rentalId);
          if (!res.ok) toast.error(res.error);
        });
      }}
    >
      {status === "requested" ? "Withdraw dibs" : "Cancel rental"}
    </Button>
  );
}
