"use client";

import { useState, useTransition } from "react";
import { Check, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import type { ScanStatus } from "@/db/schema";
import { runAction } from "../_components/action-controls";
import { approvePhoto, rejectPhoto, rerunPhotoCheck } from "../actions";

export function PhotoActions({ photoId, status }: { photoId: string; status: ScanStatus }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "rerun" | null>(null);
  const [, start] = useTransition();

  const run = (kind: "approve" | "reject" | "rerun", fn: () => ReturnType<typeof approvePhoto>) => {
    setBusy(kind);
    start(async () => {
      const res = await runAction(fn);
      setBusy(null);
      if (res?.ok) setRejecting(false);
    });
  };

  if (rejecting) {
    const noteId = `reject-note-${photoId}`;
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
        <Label htmlFor={noteId}>Note to the owner (optional)</Label>
        <Textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="The edges of the item look AI-edited. Please retake it on a plain surface."
          className="min-h-20 text-sm"
          autoFocus
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" loading={busy === "reject"} onClick={() => run("reject", () => rejectPhoto(photoId, note))}>
            Reject photo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy != null}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "approved" && (
        <Button size="sm" loading={busy === "approve"} disabled={busy != null} onClick={() => run("approve", () => approvePhoto(photoId))}>
          <Check className="size-4" /> Approve (override)
        </Button>
      )}
      {status !== "rejected" && (
        <Button size="sm" variant="secondary" disabled={busy != null} onClick={() => setRejecting(true)}>
          <X className="size-4" /> Reject
        </Button>
      )}
      {status !== "approved" && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "rerun"}
          disabled={busy != null}
          onClick={() => run("rerun", () => rerunPhotoCheck(photoId))}
        >
          <RotateCw className="size-4" /> Re-run checks
        </Button>
      )}
    </div>
  );
}
