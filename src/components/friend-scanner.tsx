"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { makeDetector } from "@/components/rental/scanner";

/** Pulls the friend code out of a scanned Dibs link, ignoring links to other sites. */
export function friendCodeFrom(raw: string, host: string): string | null {
  try {
    const url = new URL(raw.trim());
    const okHost = url.host === host || url.hostname === "dibs.school" || url.hostname.endsWith(".dibs.school");
    const match = url.pathname.match(/^\/f\/([A-Za-z0-9_-]{4,64})\/?$/);
    return okHost && match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Scans a friend's QR code without leaving the app. Phone cameras open QR links in the browser
 * (on iPhone, never in a home-screen app), so scanning here keeps you signed in.
 */
export function ScanFriendButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <ScanLine className="size-4" /> Scan a code
      </Button>
      {open && <FriendScanner onClose={() => setOpen(false)} />}
    </>
  );
}

function FriendScanner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hint, setHint] = useState("Point at a friend's Dibs code");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let warned = false;
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
          if (video.readyState >= 2) {
            try {
              const found = await detector.detect(video);
              for (const b of found) {
                const code = friendCodeFrom(b.rawValue, window.location.host);
                if (code) {
                  stopped = true;
                  navigator.vibrate?.(40);
                  router.push(`/f/${code}`);
                  onClose();
                  return;
                }
                if (!warned) {
                  warned = true;
                  setHint("That isn't a Dibs friend code");
                }
              }
            } catch {
              /* frame not ready */
            }
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        toast.error("Camera unavailable. Ask your friend to send their link instead.");
        onClose();
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B0B0F] text-white">
      <div className="flex items-center justify-between px-4 pt-safe">
        <button onClick={onClose} aria-label="Close scanner" className="mt-2 flex size-10 items-center justify-center rounded-full bg-white/10">
          <X className="size-5" />
        </button>
        <p className="mt-2 text-sm font-semibold">Add a friend</p>
        <span className="size-10" />
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-64 rounded-[36px] border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
        </div>
        <p className="absolute inset-x-0 bottom-0 px-6 pb-safe pt-6 text-center text-sm text-white/80">
          <span className="mb-6 inline-block">{hint}</span>
        </p>
      </div>
    </div>
  );
}
