"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ExternalLink, ImagePlus, LoaderCircle, Pause, Play, Trash2, X } from "lucide-react";
import { ListingEditor } from "@/components/flow/listing-editor";
import { detailsValid, type Details } from "@/components/flow/types";
import { photoContentType, uploadPhoto } from "@/components/flow/uploader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/bits";
import { Input, Label, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { removeListing, setPaused } from "@/app/actions/listings";

type Photo = { id: string; url: string | null; scanStatus: string; reason: string | null; note: string | null };
type Listing = {
  id: string;
  status: string;
  visibility: "public" | "friends" | "private";
  priceCents: number;
  maxDays: number;
  details: Details;
};

const PHOTO_BADGE: Record<string, { label: string; tone: "success" | "neutral" | "warn" | "danger" }> = {
  passed: { label: "Verified", tone: "success" },
  approved: { label: "Verified", tone: "success" },
  none: { label: "Checking", tone: "neutral" },
  queued: { label: "Checking", tone: "neutral" },
  scanning: { label: "Checking", tone: "neutral" },
  flagged: { label: "In review", tone: "warn" },
  quota_hold: { label: "In review", tone: "warn" },
  error: { label: "In review", tone: "warn" },
  rejected: { label: "Rejected", tone: "danger" },
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export function ManageListing({ listing, photos: initialPhotos }: { listing: Listing; photos: Photo[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(0);
  const [details, setDetails] = useState(listing.details);
  const [visibility, setVisibility] = useState(listing.visibility);
  const [price, setPrice] = useState(String(listing.priceCents / 100));
  const [maxDays, setMaxDays] = useState(listing.maxDays);
  const [saving, setSaving] = useState(false);
  const [pending, start] = useTransition();

  const rejected = photos.filter((p) => p.scanStatus === "rejected");

  const syncPhotos = async (order: string[]) => {
    const data = (await send(`/api/listings/${listing.id}/photos`, "POST", { order })) as { photos: { id: string; thumbUrl: string | null; scanStatus: string; scanReason: string | null }[] };
    setPhotos(data.photos.map((p) => ({ id: p.id, url: p.thumbUrl, scanStatus: p.scanStatus, reason: p.scanReason, note: null })));
    router.refresh();
  };

  const addFiles = async (files: File[]) => {
    const usable = files.filter((f) => photoContentType(f)).slice(0, 8 - photos.length);
    if (!usable.length) return;
    setUploading(usable.length);
    const ids: string[] = [];
    for (const file of usable) {
      try {
        ids.push((await uploadPhoto({ listingId: listing.id, file, source: "upload" })).id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
      setUploading((n) => n - 1);
    }
    if (ids.length) {
      try {
        await syncPhotos([...photos.map((p) => p.id), ...ids]);
        toast.success("Photo added. We'll check it before it shows up.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save photos");
      }
    }
  };

  const removePhoto = async (id: string) => {
    if (photos.length <= 1) return void toast.error("Keep at least one photo. Add a new one first.");
    try {
      await send(`/api/uploads/${id}`, "DELETE");
      setPhotos((list) => list.filter((p) => p.id !== id));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove photo");
    }
  };

  const save = async () => {
    const cents = Math.round(parseFloat(price) * 100);
    if (!detailsValid(details)) return void toast.error("Add a title and category.");
    if (!Number.isFinite(cents) || cents < 100 || cents > 10_000) return void toast.error("Price must be between $1 and $100.");
    setSaving(true);
    try {
      await send(`/api/listings/${listing.id}`, "PATCH", details);
      await send(`/api/listings/${listing.id}/publish`, "POST", { visibility, priceCents: cents, maxDays });
      toast.success("Saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/lending" className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2">
          <ChevronLeft className="size-4" /> Lending
        </Link>
        {listing.status === "active" && (
          <Link href={`/listing/${listing.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
            View as renter <ExternalLink className="size-3.5" />
          </Link>
        )}
      </div>

      {listing.status === "pending_verification" && (
        <div className={cn("rounded-3xl px-5 py-4 text-sm", rejected.length ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")}>
          {rejected.length
            ? "A photo looked AI-generated or AI-edited. Remove it and add a real photo of the item to go live."
            : "Your photos are being checked. The listing goes live on its own once they clear."}
        </div>
      )}
      {listing.status === "paused" && <div className="rounded-3xl bg-surface-2 px-5 py-4 text-sm">This listing is paused and hidden from renters.</div>}

      <section>
        <p className="mb-2 text-sm font-semibold">Photos</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => {
            const badge = PHOTO_BADGE[p.scanStatus] ?? PHOTO_BADGE.none;
            return (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url ?? ""} alt={`Photo ${i + 1}`} className={cn("size-full object-cover", p.scanStatus === "rejected" && "opacity-50")} />
                <Badge tone={badge.tone} className="absolute bottom-1.5 left-1.5 shadow-sm">
                  {badge.label}
                </Badge>
                <button onClick={() => removePhoto(p.id)} aria-label="Remove photo" className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
          {photos.length < 8 && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading > 0}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-sm text-muted transition hover:border-ink/40 hover:text-ink"
            >
              {uploading ? <LoaderCircle className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
              {uploading ? "Uploading" : "Add photo"}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void addFiles(files);
          }}
        />
        {rejected.some((p) => p.note) && <p className="mt-2 text-sm text-muted">Reviewer note: {rejected.find((p) => p.note)?.note}</p>}
      </section>

      <ListingEditor value={details} onChange={setDetails} mode="manual" />

      <section className="grid gap-4 rounded-[28px] bg-surface p-5 ring-1 ring-line sm:grid-cols-3">
        <div>
          <Label htmlFor="price">Price per day</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
            <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} className="pl-8" />
          </div>
        </div>
        <div>
          <Label htmlFor="maxDays">Longest rental</Label>
          <Select id="maxDays" value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "day" : "days"}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="visibility">Who can see it</Label>
          <Select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as Listing["visibility"])}>
            <option value="public">Public</option>
            <option value="friends">Friends only</option>
            <option value="private">Draft (only you)</option>
          </Select>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="flex-1" loading={saving} onClick={save}>
          Save changes
        </Button>
        {(listing.status === "active" || listing.status === "paused") && (
          <Button
            size="lg"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setPaused(listing.id, listing.status !== "paused");
                if (!res.ok) toast.error(res.error);
              })
            }
          >
            {listing.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
            {listing.status === "paused" ? "Resume" : "Pause"}
          </Button>
        )}
        <Button
          size="lg"
          variant="ghost"
          className="text-danger"
          disabled={pending}
          onClick={() => {
            if (!confirm("Remove this listing? Renters won't see it anymore.")) return;
            start(async () => {
              const res = await removeListing(listing.id);
              if (res && !res.ok) toast.error(res.error);
            });
          }}
        >
          <Trash2 className="size-4" /> Remove
        </Button>
      </div>
    </div>
  );
}
