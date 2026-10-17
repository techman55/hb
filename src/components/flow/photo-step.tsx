"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDropzone } from "react-dropzone";
import { Camera, ImagePlus, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LocalPhoto } from "./types";

const COACH_KEY = "dibs.coach.camera";

function PhotoCounter({ photos, onClick, dark }: { photos: LocalPhoto[]; onClick: () => void; dark?: boolean }) {
  const last = photos.slice(-3);
  const uploading = photos.some((p) => p.status === "uploading");
  return (
    <button
      onClick={onClick}
      disabled={!photos.length}
      aria-label={`${photos.length} photos taken. View them`}
      className={cn(
        "flex h-14 items-center gap-2 rounded-2xl pl-1.5 pr-3 transition active:scale-95 disabled:opacity-0",
        dark ? "bg-white/15 text-white backdrop-blur" : "bg-surface ring-1 ring-line",
      )}
    >
      <span className="relative flex h-11 w-12 items-center">
        {last.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.key}
            src={p.previewUrl}
            alt=""
            className="absolute size-10 rounded-xl object-cover ring-2 ring-black/40"
            style={{ left: i * 4, rotate: `${(i - 1) * 6}deg` }}
          />
        ))}
      </span>
      <span className="text-sm font-semibold tabular-nums">{photos.length}</span>
      {uploading && <LoaderCircle className="size-4 animate-spin opacity-70" />}
    </button>
  );
}

/** Full-screen viewfinder using the device camera, with a review step after each shot. */
function CameraView({
  photos,
  onKeep,
  onOpenTray,
  onPickFiles,
  onUnavailable,
}: {
  photos: LocalPhoto[];
  onKeep: (blob: Blob) => void;
  onOpenTray: () => void;
  onPickFiles: (files: File[]) => void;
  onUnavailable: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  // CameraView only ever renders in the browser, so reading storage up front is safe.
  const [coach, setCoach] = useState(() => {
    try {
      return !localStorage.getItem(COACH_KEY);
    } catch {
      return false;
    }
  });
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return onUnavailable("This browser can't open the camera.");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        onUnavailable("Camera access is off. You can upload photos instead.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  const capture = async () => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !track) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    let blob: Blob | null = null;
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
    if (IC) {
      try {
        blob = await new IC(track).takePhoto();
      } catch {
        blob = null;
      }
    }
    if (!blob) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    }
    if (blob) setShot({ blob, url: URL.createObjectURL(blob) });
  };

  const dismissCoach = () => {
    setCoach(false);
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black">
      <video ref={videoRef} playsInline muted className="size-full object-cover" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white/70">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      )}
      {flash && <div className="absolute inset-0 bg-white/70" />}

      <AnimatePresence>
        {coach && ready && !shot && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="absolute inset-x-6 top-1/3 mx-auto max-w-xs rounded-3xl bg-white/95 p-5 text-center text-[#0B0B0F] shadow-2xl backdrop-blur"
          >
            <p className="font-semibold">Snap a few photos of your item</p>
            <p className="mt-1 text-sm text-[#55555f]">Real photos only. We check every one.</p>
            <button onClick={dismissCoach} className="mt-4 h-10 w-full rounded-full bg-[#0B0B0F] text-sm font-semibold text-white">
              Got it
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt="Photo you just took" className="size-full object-contain" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-safe pt-16">
              <p className="mb-4 text-center text-lg font-semibold text-white">Does this look good?</p>
              <div className="mx-auto mb-3 flex max-w-sm gap-3">
                <button
                  onClick={() => {
                    URL.revokeObjectURL(shot.url);
                    setShot(null);
                  }}
                  className="h-13 flex-1 rounded-full bg-white/15 py-3.5 font-semibold text-white backdrop-blur transition active:scale-95"
                >
                  Retake
                </button>
                <button
                  onClick={() => {
                    onKeep(shot.blob);
                    setShot(null);
                  }}
                  className="h-13 flex-1 rounded-full bg-white py-3.5 font-semibold text-[#0B0B0F] transition active:scale-95"
                >
                  Looks good!
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-safe pt-10">
        <div className="mx-auto mb-3 flex max-w-md items-center justify-between">
          <div className="w-24">
            <PhotoCounter photos={photos} onClick={onOpenTray} dark />
          </div>
          <button
            onClick={capture}
            disabled={!ready}
            aria-label="Take photo"
            className="flex size-[76px] items-center justify-center rounded-full border-4 border-white/90 transition active:scale-90 disabled:opacity-40"
          >
            <span className="size-[60px] rounded-full bg-white" />
          </button>
          <div className="flex w-24 justify-end">
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Upload from your photos"
              className="flex size-14 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur transition active:scale-95"
            >
              <ImagePlus className="size-6" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) onPickFiles(files);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Dropzone({
  photos,
  onFiles,
  onUseCamera,
  onOpenTray,
  notice,
  touch,
}: {
  photos: LocalPhoto[];
  onFiles: (files: File[]) => void;
  onUseCamera: (() => void) | null;
  onOpenTray: () => void;
  notice: string | null;
  touch: boolean;
}) {
  const onDrop = useCallback((files: File[]) => files.length && onFiles(files), [onFiles]);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] },
    multiple: true,
    noClick: true,
  });
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-10 pt-24">
      <h1 className="text-3xl font-bold tracking-tight">Add photos of your item</h1>
      <p className="mt-2 text-muted">Real photos only. Every photo is checked before your listing goes live.</p>
      {notice && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <TriangleAlert className="size-4 shrink-0" /> {notice}
        </p>
      )}
      <div
        {...getRootProps()}
        className={cn(
          "mt-6 flex flex-1 flex-col items-center justify-center rounded-[28px] border-2 border-dashed px-6 py-16 text-center transition",
          isDragActive ? "border-accent bg-accent-soft" : "border-line bg-surface",
        )}
      >
        <input {...getInputProps()} />
        <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2">
          <Upload className="size-6" />
        </span>
        <p className="mt-4 text-lg font-semibold">
          {isDragActive ? "Drop to add" : touch ? "Add from your photos" : "Drag photos here"}
        </p>
        <p className="mt-1 text-sm text-muted">JPEG, PNG, WebP or HEIC, up to 8 photos</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={open}>
            <ImagePlus className="size-4" /> Choose photos
          </Button>
          {onUseCamera && (
            <Button variant="secondary" onClick={onUseCamera}>
              <Camera className="size-4" /> Use camera
            </Button>
          )}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <PhotoCounter photos={photos} onClick={onOpenTray} />
        {photos.length > 0 && <p className="text-sm text-muted">Tap the stack to review or reorder</p>}
      </div>
    </div>
  );
}

type Caps = { coarse: boolean; camera: boolean };
let caps: Caps | undefined;
const readCaps = () =>
  (caps ??= { coarse: window.matchMedia("(pointer: coarse)").matches, camera: !!navigator.mediaDevices?.getUserMedia });
const noSubscribe = () => () => {};

export function PhotoStep({
  photos,
  onKeep,
  onFiles,
  onOpenTray,
}: {
  photos: LocalPhoto[];
  onKeep: (blob: Blob) => void;
  onFiles: (files: File[]) => void;
  onOpenTray: () => void;
}) {
  // Phones open the camera first; desktops default to the dropzone. Unknown until hydrated.
  const device = useSyncExternalStore(noSubscribe, readCaps, () => null);
  const [choice, setChoice] = useState<"camera" | "dropzone" | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const unavailable = useCallback((reason: string) => {
    setNotice(reason);
    setCameraFailed(true);
    setChoice("dropzone");
  }, []);

  if (!device) return null;
  const hasCamera = device.camera && !cameraFailed;
  const mode = choice ?? (device.coarse && hasCamera ? "camera" : "dropzone");
  if (mode === "camera") {
    return <CameraView photos={photos} onKeep={onKeep} onOpenTray={onOpenTray} onPickFiles={onFiles} onUnavailable={unavailable} />;
  }
  return (
    <Dropzone
      photos={photos}
      onFiles={onFiles}
      onUseCamera={hasCamera ? () => setChoice("camera") : null}
      onOpenTray={onOpenTray}
      notice={notice}
      touch={device.coarse}
    />
  );
}
