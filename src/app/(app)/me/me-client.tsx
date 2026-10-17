"use client";

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Check, Copy, Share2 } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { Input, Label } from "@/components/ui/field";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { confirmPhone, friendAction, removePhone, saveProfile, startPhoneVerification, toggleFollow } from "@/app/actions/profile";

export function ProfileForm({ name, venmo, cashapp }: { name: string; venmo: string; cashapp: string }) {
  const [v, setV] = useState({ name, venmo, cashapp });
  const [pending, start] = useTransition();
  const dirty = v.name !== name || v.venmo !== venmo || v.cashapp !== cashapp;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveProfile(v);
          if (res.ok) toast.success("Saved");
          else toast.error(res.error);
        });
      }}
      className="grid gap-4 sm:grid-cols-3"
    >
      <div className="sm:col-span-3">
        <Label htmlFor="p-name">Name</Label>
        <Input id="p-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div className="sm:col-span-3 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="p-venmo">Venmo</Label>
          <Input id="p-venmo" value={v.venmo} placeholder="@username" onChange={(e) => setV({ ...v, venmo: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="p-cash">Cash App</Label>
          <Input id="p-cash" value={v.cashapp} placeholder="$cashtag" onChange={(e) => setV({ ...v, cashapp: e.target.value })} />
        </div>
      </div>
      {dirty && (
        <Button type="submit" loading={pending} className="sm:col-span-3">
          Save
        </Button>
      )}
    </form>
  );
}

export function PhoneSettings({ phone }: { phone: string | null }) {
  const [input, setInput] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  if (phone) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{phone}</p>
          <p className="text-sm text-muted">You can sign in with a text code.</p>
        </div>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await removePhone()))}>
          Remove
        </Button>
      </div>
    );
  }
  return sent ? (
    <div>
      <p className="mb-3 text-sm text-muted">Enter the code we texted to {input}.</p>
      <CodeInput
        value={code}
        onChange={setCode}
        disabled={pending}
        onComplete={(v) =>
          start(async () => {
            const res = await confirmPhone(input, v);
            if (res.ok) toast.success("Phone verified");
            else {
              toast.error(res.error);
              setCode("");
            }
          })
        }
      />
    </div>
  ) : (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await startPhoneVerification(input);
          if (res.ok) setSent(true);
          else toast.error(res.error);
        });
      }}
    >
      <Input type="tel" inputMode="tel" placeholder="(205) 555-0123" value={input} onChange={(e) => setInput(e.target.value)} />
      <Button type="submit" loading={pending} disabled={input.replace(/\D/g, "").length < 10}>
        Verify
      </Button>
    </form>
  );
}

export function FriendCode({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0B0B0F", light: "#FFFFFF" } }).then(setSvg);
  }, [url]);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-4">
      <div className="size-28 shrink-0 rounded-2xl bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0">
        <p className="text-sm text-muted">Friends can scan this or open your link to add you.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
          </Button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <Button size="sm" variant="secondary" onClick={() => navigator.share({ title: "Add me on Dibs", url }).catch(() => {})}>
              <Share2 className="size-4" /> Share
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FriendButtons({ otherId, state }: { otherId: string; state: "incoming" | "friends" | "outgoing" | "none" }) {
  const [pending, start] = useTransition();
  const act = (a: "add" | "accept" | "decline" | "remove") =>
    start(async () => {
      const res = await friendAction(otherId, a);
      if (!res.ok) toast.error(res.error);
    });
  if (state === "incoming") {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => act("decline")}>
          Ignore
        </Button>
        <Button size="sm" loading={pending} onClick={() => act("accept")}>
          Accept
        </Button>
      </div>
    );
  }
  if (state === "friends") {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Remove friend?") && act("remove")}>
        Friends
      </Button>
    );
  }
  if (state === "outgoing") {
    return (
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => act("remove")}>
        Requested
      </Button>
    );
  }
  return (
    <Button size="sm" loading={pending} onClick={() => act("add")}>
      Add friend
    </Button>
  );
}

export function FollowChips({ following }: { following: string[] }) {
  const [on, setOn] = useState(new Set(following));
  const [, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.filter((c) => c.slug !== "other").map((c) => {
        const active = on.has(c.slug);
        return (
          <button
            key={c.slug}
            onClick={() => {
              const next = new Set(on);
              if (active) next.delete(c.slug);
              else next.add(c.slug);
              setOn(next);
              start(async () => void (await toggleFollow(c.slug, !active)));
            }}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition",
              active ? "bg-ink text-ink-inverse" : "bg-surface-2 hover:bg-line",
            )}
          >
            <CategoryIcon slug={c.slug} className="size-4" />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
