"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, Keyboard, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

export async function makeDetector(): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (native) {
    try {
      return new native({ formats: ["qr_code"] });
    } catch {
      /* fall through to the WASM ponyfill */
    }
  }
  // iOS Safari has no BarcodeDetector; use the ZXing WASM build served from /public.
  const mod = await import("barcode-detector/ponyfill");
  mod.prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/${path}` : prefix + path) },
  });
  return new mod.BarcodeDetector({ formats: ["qr_code"] });
}

/**
 * Full-screen scanner the owner uses at pickup and return. Reads the renter's rotating QR code,
 * or takes the 6-digit code if the camera isn't cooperating.
 */
export function HandoffScanner({
  rentalId,
  action,
  renterName,
  onClose,
  onDone,
}: {
  rentalId: string;
  action: "pickup" | "return";
  renterName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const [mode, setMode] = useState<"camera" | "code">("camera");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (value: string) => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rentals/${rentalId}/handoff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn't work");
      setDone(true);
      navigator.vibrate?.(60);
      setTimeout(onDone, 1400);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work");
      setCode("");
      setTimeout(() => (busy.current = false), 1500);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (mode !== "camera") return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const detector = await makeDetector();
        const tick = async () => {
          if (stopped) return;
          if (!busy.current && video.readyState >= 2) {
            try {
              const found = await detector.detect(video);
              const hit = found.find((b) => b.rawValue.startsWith("DIBS1:"));
              if (hit) await submit(hit.rawValue);
            } catch {
              /* frame not ready */
            }
          }
          raf = window.setTimeout(tick, 250) as unknown as number;
        };
        tick();
      } catch {
        setMode("code");
        toast("Camera unavailable. Type the 6-digit code instead.");
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B0B0F] text-white">
      <div className="flex items-center justify-between px-4 pt-safe">
        <button onClick={onClose} aria-label="Close scanner" className="mt-2 flex size-10 items-center justify-center rounded-full bg-white/10">
          <X className="size-5" />
        </button>
        <p className="mt-2 text-sm font-semibold">{action === "pickup" ? "Confirm pickup" : "Confirm return"}</p>
        <span className="size-10" />
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 16 }}
            className="flex size-24 items-center justify-center rounded-full bg-[#0f9f5f]"
          >
            <Check className="size-12" strokeWidth={3} />
          </motion.span>
          <p className="mt-6 text-2xl font-bold">{action === "pickup" ? "Picked up" : "Returned"}</p>
          <p className="mt-1 text-white/70">Verified in person with {renterName}.</p>
        </div>
      ) : mode === "camera" ? (
        <div className="relative flex-1">
          <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-64 rounded-[36px] border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pb-safe pt-6">
            <p className="text-center text-sm text-white/80">Point at the code on {renterName}&apos;s phone</p>
            {submitting && <LoaderCircle className="size-5 animate-spin" />}
            <Button variant="secondary" className="mb-4 border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => setMode("code")}>
              <Keyboard className="size-4" /> Enter code instead
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center px-6">
          <p className="mb-4 text-center text-white/80">Type the 6-digit code under {renterName}&apos;s QR code</p>
          <div className="mx-auto w-full max-w-sm [&_span.border-line]:border-white/20 [&_span]:bg-white/5 [&_span]:text-white">
            <CodeInput value={code} onChange={setCode} onComplete={submit} autoFocus disabled={submitting} />
          </div>
          <button onClick={() => setMode("camera")} className="mx-auto mt-6 text-sm text-white/70 underline underline-offset-4">
            Scan instead
          </button>
        </div>
      )}
    </div>
  );
}
