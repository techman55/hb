"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { LoaderCircle } from "lucide-react";

type CodeState = { action: "pickup" | "return" | null; status: string; qr?: string; code?: string; refreshIn?: number };

/**
 * The renter's side of a handoff: a QR code plus 6 digits that rotate every 30 seconds, so a
 * screenshot can't be reused later. Refreshes itself and notices when the owner has scanned it.
 */
export function HandoffCode({ rentalId, initialStatus }: { rentalId: string; initialStatus: string }) {
  const router = useRouter();
  const [state, setState] = useState<CodeState | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [left, setLeft] = useState(30);
  const lastCode = useRef<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rentals/${rentalId}/code`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as CodeState;
    if (data.status !== initialStatus) return router.refresh();
    setLeft(data.refreshIn ?? 30);
    // Only redraw when the 30-second code actually changes, so the QR doesn't flicker.
    if (data.qr && data.code !== lastCode.current) {
      lastCode.current = data.code ?? null;
      setSvg(await QRCode.toString(data.qr, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B0B0F", light: "#FFFFFF" } }));
      setState(data);
    } else if (!data.qr) setState(data);
  }, [rentalId, initialStatus, router]);

  useEffect(() => {
    // Fetch right away, then every few seconds: picks up the next code and notices the scan.
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), 4000);
    const tick = setInterval(() => setLeft((s) => Math.max(1, s - 1)), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  if (!state) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-[28px] bg-white">
        <LoaderCircle className="size-6 animate-spin text-[#0B0B0F]" />
      </div>
    );
  }
  if (!state.action || !state.code) return null;

  return (
    <div className="rounded-[32px] bg-white p-5 text-[#0B0B0F] shadow-xl ring-1 ring-black/5">
      <p className="text-center text-sm font-semibold uppercase tracking-wide text-[#6B6B76]">
        {state.action === "pickup" ? "Pickup code" : "Return code"}
      </p>
      <div className="mx-auto mt-3 aspect-square w-full max-w-[280px] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-4 text-center font-mono text-4xl font-bold tracking-[0.3em]">
        {state.code.slice(0, 3)} {state.code.slice(3)}
      </p>
      <div className="mx-auto mt-4 h-1 w-40 overflow-hidden rounded-full bg-[#EFEFEB]">
        <div className="h-full rounded-full bg-[#0B0B0F] transition-[width] duration-1000 ease-linear" style={{ width: `${(left / 30) * 100}%` }} />
      </div>
      <p className="mt-2 text-center text-xs text-[#6B6B76]">Refreshes in {left}s. Show this to the owner.</p>
    </div>
  );
}
