"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, Globe, Lock, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Textarea } from "@/components/ui/field";
import { cn, formatMoney } from "@/lib/utils";
import { FlowIsland } from "./flow-island";
import { EditorSkeleton, ListingEditor } from "./listing-editor";
import { PhotoStep } from "./photo-step";
import { PhotoTray } from "./photo-tray";
import { detailsValid, EMPTY_DETAILS, type Details, type LocalPhoto } from "./types";
import { photoContentType, uploadPhoto } from "./uploader";

type Step = "photos" | "gotit" | "brief" | "review" | "feedback" | "manual" | "visibility" | "price" | "done";
type Visibility = "public" | "friends" | "private";

export type FlowInitial = {
  listingId: string | null;
  photos: { id: string; thumbUrl: string | null }[];
  details: Details | null;
  aiGenerated: boolean;
  brief: string;
  suggested: { cents: number; note: string | null } | null;
  visibility: Visibility | null;
  priceCents: number | null;
  maxDays: number;
};

const LABELS: Record<Step, string> = {
  photos: "Add photos",
  gotit: "Photos added",
  brief: "Describe it",
  review: "Your listing",
  feedback: "What went wrong?",
  manual: "Listing details",
  visibility: "Who can see it",
  price: "Price",
  done: "Done",
};

const BASE: Record<Step, number> = {
  photos: 0.06,
  gotit: 0.24,
  brief: 0.36,
  review: 0.5,
  feedback: 0.46,
  manual: 0.5,
  visibility: 0.7,
  price: 0.86,
  done: 1,
};

const MAX_PHOTOS = 8;

async function api<T>(url: string, init: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn("mx-auto w-full max-w-xl px-5 pb-40 pt-24", className)}
    >
      {children}
    </motion.div>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pb-safe pt-8">
      <div className="mx-auto mb-2 flex max-w-xl flex-col gap-2">{children}</div>
    </div>
  );
}

export function ListingFlow({ initial }: { initial: FlowInitial }) {
  const router = useRouter();
  const ask = useConfirm();
  const listingRef = useRef<string | null>(initial.listingId);
  const creating = useRef<Promise<string> | null>(null);
  const [listingId, setListingId] = useState(initial.listingId);

  const [photos, setPhotos] = useState<LocalPhoto[]>(() =>
    initial.photos.map((p) => ({ key: p.id, photoId: p.id, previewUrl: p.thumbUrl ?? "", source: "upload", status: "uploaded", progress: 1 })),
  );
  const [step, setStep] = useState<Step>(() => {
    if (!initial.photos.length) return "photos";
    if (initial.details?.title) return initial.aiGenerated ? "review" : "manual";
    return "gotit";
  });
  const [path, setPath] = useState<"ai" | "manual">(initial.aiGenerated ? "ai" : "manual");
  const [trayOpen, setTrayOpen] = useState(false);
  const [brief, setBrief] = useState(initial.brief);
  const [feedback, setFeedback] = useState("");
  const [details, setDetails] = useState<Details>(initial.details ?? EMPTY_DETAILS);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(initial.suggested);
  const [visibility, setVisibility] = useState<Visibility | null>(initial.visibility);
  const [priceInput, setPriceInput] = useState(initial.priceCents ? String(initial.priceCents / 100) : "");
  const [maxDays, setMaxDays] = useState(initial.maxDays || 7);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; visibility: Visibility } | null>(null);

  // ── photos ─────────────────────────────────────────────────────

  const ensureListing = useCallback(async () => {
    if (listingRef.current) return listingRef.current;
    creating.current ??= api<{ id: string }>("/api/listings", { method: "POST" }).then(({ id }) => {
      listingRef.current = id;
      setListingId(id);
      window.history.replaceState(null, "", `/lending/new?id=${id}`);
      return id;
    });
    return creating.current;
  }, []);

  const patchPhoto = (key: string, patch: Partial<LocalPhoto>) =>
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addBlob = useCallback(
    (file: Blob & { name?: string }, source: "camera" | "upload") => {
      const key = crypto.randomUUID();
      setPhotos((list) => [...list, { key, previewUrl: URL.createObjectURL(file), source, status: "uploading", progress: 0 }]);
      (async () => {
        try {
          const listingId = await ensureListing();
          const res = await uploadPhoto({ listingId, file, source, onProgress: (progress) => patchPhoto(key, { progress }) });
          patchPhoto(key, { status: "uploaded", progress: 1, photoId: res.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          patchPhoto(key, { status: "error", error: message });
          toast.error(message);
        }
      })();
    },
    [ensureListing],
  );

  const onFiles = useCallback(
    (files: File[]) => {
      const room = MAX_PHOTOS - photos.filter((p) => p.status !== "error").length;
      if (room <= 0) return void toast.error(`Up to ${MAX_PHOTOS} photos per listing.`);
      const usable = files.filter((f) => photoContentType(f));
      if (usable.length < files.length) toast.error("Some files weren't photos and were skipped.");
      usable.slice(0, room).forEach((f) => addBlob(f, "upload"));
    },
    [photos, addBlob],
  );

  const removePhoto = (key: string) => {
    const p = photos.find((x) => x.key === key);
    if (p?.photoId) void fetch(`/api/uploads/${p.photoId}`, { method: "DELETE" });
    setPhotos((list) => list.filter((x) => x.key !== key));
  };

  const coverPhoto = (key: string) =>
    setPhotos((list) => {
      const p = list.find((x) => x.key === key);
      return p ? [p, ...list.filter((x) => x.key !== key)] : list;
    });

  const uploaded = photos.filter((p) => p.status === "uploaded");
  const uploading = photos.some((p) => p.status === "uploading");

  const finalizePhotos = async () => {
    setBusy(true);
    try {
      const id = await ensureListing();
      await api(`/api/listings/${id}/photos`, { method: "POST", body: { order: uploaded.map((p) => p.photoId) } });
      setPhotos((list) => list.filter((p) => p.status === "uploaded"));
      setStep("gotit");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save photos");
    } finally {
      setBusy(false);
    }
  };

  // ── details ────────────────────────────────────────────────────

  const generate = async (withFeedback?: string) => {
    setPath("ai");
    setGenerating(true);
    setGenError(null);
    setStep("review");
    try {
      const id = await ensureListing();
      const res = await api<{
        listing: Details & { suggested_price_per_day_cents: number; price_note: string };
      }>(`/api/listings/${id}/generate`, {
        method: "POST",
        body: { brief, feedback: withFeedback || undefined, previous: withFeedback ? details : undefined },
      });
      const l = res.listing;
      setDetails({ title: l.title, description: l.description, category: l.category, condition: l.condition, tags: l.tags, included: l.included });
      setSuggested({ cents: l.suggested_price_per_day_cents, note: l.price_note });
      if (!priceInput) setPriceInput(String(l.suggested_price_per_day_cents / 100));
      setFeedback("");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Couldn't write the listing");
    } finally {
      setGenerating(false);
    }
  };

  const saveDetails = async () => {
    setBusy(true);
    try {
      const id = await ensureListing();
      await api(`/api/listings/${id}`, { method: "PATCH", body: details });
      setStep("visibility");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  // ── price & publish ────────────────────────────────────────────

  const priceCents = Math.round(parseFloat(priceInput.replace(/[^0-9.]/g, "")) * 100);
  const priceValid = Number.isFinite(priceCents) && priceCents >= 100 && priceCents <= 10_000;

  const publish = async () => {
    if (!visibility || !priceValid) return;
    setBusy(true);
    try {
      const id = await ensureListing();
      const res = await api<{ status: string; visibility: Visibility }>(`/api/listings/${id}/publish`, {
        method: "POST",
        body: { visibility, priceCents, maxDays },
      });
      setResult(res);
      setStep("done");
      router.prefetch("/lending");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't publish");
    } finally {
      setBusy(false);
    }
  };

  // ── navigation ─────────────────────────────────────────────────

  const back: Partial<Record<Step, Step>> = {
    gotit: "photos",
    brief: "gotit",
    review: "brief",
    feedback: "review",
    manual: "gotit",
    visibility: path === "ai" ? "review" : "manual",
    price: "visibility",
  };
  const backTo = back[step];

  const next = (() => {
    switch (step) {
      case "photos":
        return uploaded.length && !uploading ? { onClick: finalizePhotos, busy } : null;
      case "brief":
        return brief.trim().length >= 2 ? { onClick: () => generate() } : null;
      case "review":
        return !generating && !genError && detailsValid(details) ? { onClick: saveDetails, busy } : null;
      case "feedback":
        return feedback.trim().length >= 2 ? { onClick: () => generate(feedback) } : null;
      case "manual":
        return detailsValid(details) ? { onClick: saveDetails, busy } : null;
      case "visibility":
        return visibility ? { onClick: () => setStep("price") } : null;
      case "price":
        return priceValid ? { onClick: publish, busy, label: "Publish" } : null;
      default:
        return null;
    }
  })();

  const progress = step === "photos" ? BASE.photos + Math.min(uploaded.length, 4) * 0.035 : BASE[step];
  const cover = photos[0]?.previewUrl;

  useEffect(() => {
    // Leaving mid-upload loses the photo, so warn first.
    const handler = (e: BeforeUnloadEvent) => {
      if (uploading) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploading]);

  return (
    <div className="min-h-dvh bg-bg">
      <FlowIsland
        label={LABELS[step]}
        progress={progress}
        onBack={backTo ? () => setStep(backTo) : undefined}
        onClose={async () => {
          // The draft is saved as you go; only a photo still uploading would be lost.
          if (
            uploading &&
            !(await ask({
              title: "Leave while a photo uploads?",
              description: "Your draft is saved, but the photo that's still uploading will be lost.",
              confirmLabel: "Leave",
              cancelLabel: "Stay",
            }))
          ) {
            return;
          }
          router.push("/lending");
        }}
        next={next}
      />
      <PhotoTray open={trayOpen} onOpenChange={setTrayOpen} photos={photos} onRemove={removePhoto} onCover={coverPhoto} />

      <AnimatePresence mode="wait">
        {step === "photos" && (
          <motion.div key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PhotoStep photos={photos} onKeep={(b) => addBlob(b, "camera")} onFiles={onFiles} onOpenTray={() => setTrayOpen(true)} />
          </motion.div>
        )}

        {step === "gotit" && (
          <Page key="gotit">
            <div className={cn("no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2", photos.length === 1 && "justify-center")}>
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.key}
                  src={p.previewUrl}
                  alt=""
                  className="aspect-[4/5] h-[min(50dvh,440px)] w-auto shrink-0 snap-center rounded-[28px] object-cover ring-1 ring-line"
                />
              ))}
            </div>
            <h1 className="mt-8 text-4xl font-bold tracking-tight">Got it.</h1>
            <p className="mt-2 flex items-center gap-1.5 text-muted">
              <ShieldCheck className="size-4" /> We&apos;re checking your photos in the background.
            </p>
            <BottomBar>
              <Button variant="accent" size="lg" className="w-full" onClick={() => setStep("brief")}>
                <Sparkles className="size-5" /> Generate listing for me
              </Button>
              <button
                onClick={() => {
                  setPath("manual");
                  if (!initial.details?.title && path !== "manual") setDetails(EMPTY_DETAILS);
                  setStep("manual");
                }}
                className="mx-auto py-2 text-[15px] font-medium text-ink underline underline-offset-4"
              >
                Enter details manually
              </button>
            </BottomBar>
          </Page>
        )}

        {step === "brief" && (
          <Page key="brief">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">Briefly describe your listing in a few words.</h1>
            <p className="mt-3 text-muted">Nobody sees this but you. This is just for us to create your perfect listing.</p>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value.slice(0, 300))}
              placeholder="e.g. TI-84 Plus CE, rose gold, comes with charger"
              className="mt-6 min-h-32 text-[17px]"
              autoFocus
            />
            <BottomBar>
              <Button variant="accent" size="lg" className="w-full" disabled={brief.trim().length < 2} onClick={() => generate()}>
                <Sparkles className="size-5" /> Write my listing
              </Button>
            </BottomBar>
          </Page>
        )}

        {step === "review" && (
          <Page key="review">
            {generating ? (
              <EditorSkeleton />
            ) : genError ? (
              <div className="rounded-[28px] bg-surface p-6 text-center ring-1 ring-line">
                <p className="font-semibold">{genError}</p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button onClick={() => generate()}>Try again</Button>
                  <Button variant="ghost" onClick={() => { setPath("manual"); setStep("manual"); }}>
                    Enter details manually
                  </Button>
                </div>
              </div>
            ) : (
              <ListingEditor value={details} onChange={setDetails} mode="ai" photoUrl={cover} />
            )}
            {!generating && !genError && (
              <BottomBar>
                <p className="text-center text-sm font-medium text-muted">Does everything look right?</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep("feedback")}>
                    Something&apos;s off
                  </Button>
                  <Button size="lg" className="flex-1" disabled={!detailsValid(details)} loading={busy} onClick={saveDetails}>
                    Looks good
                  </Button>
                </div>
              </BottomBar>
            )}
          </Page>
        )}

        {step === "feedback" && (
          <Page key="feedback">
            <h1 className="text-3xl font-bold tracking-tight">What went wrong?</h1>
            <p className="mt-3 text-muted">Tell us what to fix and we&apos;ll rewrite it. Small fixes? Just tap the text on the last screen.</p>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value.slice(0, 400))}
              placeholder="e.g. It's the TI-84 Plus, not the CE. No charger included."
              className="mt-6 min-h-32 text-[17px]"
              autoFocus
            />
            <BottomBar>
              <Button variant="accent" size="lg" className="w-full" disabled={feedback.trim().length < 2} onClick={() => generate(feedback)}>
                <Sparkles className="size-5" /> Rewrite it
              </Button>
            </BottomBar>
          </Page>
        )}

        {step === "manual" && (
          <Page key="manual">
            <h1 className="mb-1 text-3xl font-bold tracking-tight">Tell renters about it</h1>
            <p className="mb-6 text-muted">Fill in the basics. You can change any of this later.</p>
            <ListingEditor value={details} onChange={setDetails} mode="manual" photoUrl={cover} />
            <BottomBar>
              <Button size="lg" className="w-full" disabled={!detailsValid(details)} loading={busy} onClick={saveDetails}>
                Continue
              </Button>
            </BottomBar>
          </Page>
        )}

        {step === "visibility" && (
          <Page key="visibility">
            <h1 className="text-3xl font-bold tracking-tight">Who can see it?</h1>
            <div className="mt-6 flex flex-col gap-3" role="radiogroup">
              {(
                [
                  { v: "public", icon: Globe, title: "Public", body: "Anyone on Dibs, including students at other schools browsing beyond their own." },
                  { v: "friends", icon: Users, title: "Friends only", body: "Only people you've added as friends." },
                  { v: "private", icon: Lock, title: "Draft (private)", body: "Only you. Publish it whenever you're ready." },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  role="radio"
                  aria-checked={visibility === o.v}
                  onClick={() => setVisibility(o.v)}
                  className={cn(
                    "flex items-start gap-4 rounded-3xl bg-surface p-5 text-left ring-1 transition",
                    visibility === o.v ? "ring-2 ring-ink" : "ring-line hover:ring-ink/30",
                  )}
                >
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", visibility === o.v ? "bg-ink text-ink-inverse" : "bg-surface-2")}>
                    <o.icon className="size-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{o.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{o.body}</span>
                  </span>
                  <span className={cn("mt-1 flex size-6 items-center justify-center rounded-full border-2", visibility === o.v ? "border-ink bg-ink text-ink-inverse" : "border-line")}>
                    {visibility === o.v && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>
              ))}
            </div>
            <BottomBar>
              <Button size="lg" className="w-full" disabled={!visibility} onClick={() => setStep("price")}>
                Continue
              </Button>
            </BottomBar>
          </Page>
        )}

        {step === "price" && (
          <Page key="price">
            <h1 className="text-3xl font-bold tracking-tight">How much would you like per day?</h1>
            <label className="mt-10 flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold text-muted">$</span>
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9.]/g, "").slice(0, 6))}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                aria-label="Price per day in dollars"
                className="w-[4ch] bg-transparent text-center text-7xl font-bold tracking-tight outline-none placeholder:text-line"
                style={{ width: `${Math.max(1, priceInput.length || 1) + 0.5}ch` }}
              />
              <span className="text-xl font-semibold text-muted">/day</span>
            </label>
            {suggested && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setPriceInput(String(suggested.cents / 100))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-2 text-sm font-semibold text-accent transition active:scale-95"
                >
                  <Sparkles className="size-4" /> Suggested {formatMoney(suggested.cents)}/day
                  {suggested.note && <span className="font-normal opacity-80">· {suggested.note}</span>}
                </button>
              </div>
            )}
            {priceInput && !priceValid && <p className="mt-3 text-center text-sm text-danger">Pick something between $1 and $100.</p>}

            <div className="mt-12 rounded-3xl bg-surface p-5 ring-1 ring-line">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">Longest rental</p>
                <p className="text-lg font-bold tabular-nums">
                  {maxDays === 1 ? "1 day" : maxDays === 7 ? "1 week" : maxDays === 14 ? "2 weeks" : `${maxDays} days`}
                </p>
              </div>
              <input
                type="range"
                min={1}
                max={30}
                value={maxDays}
                onChange={(e) => setMaxDays(Number(e.target.value))}
                className="dibs-range mt-5 w-full"
                style={{ ["--fill" as string]: `${((maxDays - 1) / 29) * 100}%` }}
                aria-label="Maximum rental length in days"
              />
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span>1 day</span>
                <span>1 week</span>
                <span>2 weeks</span>
                <span>30 days</span>
              </div>
              {priceValid && (
                <p className="mt-4 text-sm text-muted">
                  A {maxDays >= 7 ? "week" : `${maxDays}-day rental`} would come to{" "}
                  <span className="font-semibold text-ink">{formatMoney(priceCents * Math.min(7, maxDays))}</span>.
                </p>
              )}
            </div>
            <BottomBar>
              <Button size="lg" className="w-full" disabled={!priceValid} loading={busy} onClick={publish}>
                {visibility === "private" ? "Save draft" : "Publish"}
              </Button>
            </BottomBar>
          </Page>
        )}

        {step === "done" && result && listingId && (
          <DoneStep key="done" listingId={listingId!} result={result} title={details.title} cover={cover} />
        )}
      </AnimatePresence>
    </div>
  );
}

function DoneStep({
  listingId,
  result,
  title,
  cover,
}: {
  listingId: string;
  result: { status: string; visibility: Visibility };
  title: string;
  cover?: string;
}) {
  const [status, setStatus] = useState(result.status);

  useEffect(() => {
    if (status !== "pending_verification") return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const res = (await fetch(`/api/listings/${listingId}/photos`)
        .then((r) => r.json())
        .catch(() => null)) as { photos?: { scanStatus: string }[] } | null;
      const photos = res?.photos ?? [];
      if (photos.length && photos.every((p) => p.scanStatus === "passed" || p.scanStatus === "approved")) {
        setStatus("active");
        clearInterval(timer);
      } else if (photos.some((p) => ["flagged", "quota_hold", "rejected"].includes(p.scanStatus)) || tries > 20) {
        clearInterval(timer);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [status, listingId]);

  const live = status === "active";
  const isPrivate = result.visibility === "private";
  return (
    <Page className="text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="relative mx-auto mt-6 w-48"
      >
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="aspect-square w-full rounded-[32px] object-cover shadow-xl ring-1 ring-line" />
        )}
        <span className={cn("absolute -bottom-3 -right-3 flex size-14 items-center justify-center rounded-full text-white ring-4 ring-bg", live ? "bg-success" : "bg-ink")}>
          {live ? <Check className="size-7" strokeWidth={3} /> : <ShieldCheck className="size-7" />}
        </span>
      </motion.div>
      <h1 className="mt-10 text-3xl font-bold tracking-tight">
        {isPrivate && live ? "Saved as a draft" : live ? "You're live" : "Almost there"}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-muted">
        {isPrivate && live
          ? `Only you can see ${title}. Change who can see it any time from Lending.`
          : live
            ? `${title} is up. Requests show up at the top of Lending.`
            : "We're making sure your photos are real. It goes live on its own once they clear, and you can follow along under Pending."}
      </p>
      <BottomBar>
        {live && !isPrivate ? (
          <Button asChild size="lg" className="w-full">
            <Link href={`/listing/${listingId}`}>View listing</Link>
          </Button>
        ) : null}
        <Button asChild variant={live && !isPrivate ? "secondary" : "primary"} size="lg" className="w-full">
          <Link href="/lending">Back to Lending</Link>
        </Button>
      </BottomBar>
    </Page>
  );
}
