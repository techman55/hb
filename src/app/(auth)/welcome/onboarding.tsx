"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Phone } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { SchoolChip, type SchoolLike } from "@/components/school-chip";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { Hint, Input, Label } from "@/components/ui/field";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { confirmPhone, finishOnboarding, saveProfile, setFollows, startPhoneVerification } from "@/app/actions/profile";

type Step = "name" | "phone" | "follows";
const STEPS: Step[] = ["name", "phone", "follows"];

export function Onboarding({
  email,
  initialName,
  phoneVerified,
  school,
  next,
}: {
  email: string;
  initialName: string;
  phoneVerified: boolean;
  school: SchoolLike & { name: string };
  next: string | null;
}) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState(initialName);
  const [venmo, setVenmo] = useState("");
  const [cashapp, setCashapp] = useState("");
  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(phoneVerified);
  const [follows, setFollowState] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>, onOk?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && !res.ok) setError(res.error ?? "Something went wrong.");
      else onOk?.();
    });
  };

  return (
    <div>
      <div className="mb-8 flex gap-1.5">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={cn("h-1 flex-1 rounded-full transition-colors", i <= STEPS.indexOf(step) ? "bg-ink" : "bg-line")}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
        >
          {step === "name" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveProfile({ name, venmo, cashapp }), () => setStep("phone"));
              }}
            >
              <SchoolChip school={school} label={school.name} className="mb-4" />
              <h1 className="text-[32px] font-bold leading-tight tracking-tight">You&apos;re in. What should we call you?</h1>
              <p className="mt-2 text-muted">Renters and owners see your name when you meet up.</p>
              <div className="mt-8 flex flex-col gap-5">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last name" autoFocus required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="venmo">Venmo <span className="font-normal text-muted">(optional)</span></Label>
                    <Input id="venmo" value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@username" autoCapitalize="none" />
                  </div>
                  <div>
                    <Label htmlFor="cashapp">Cash App <span className="font-normal text-muted">(optional)</span></Label>
                    <Input id="cashapp" value={cashapp} onChange={(e) => setCashapp(e.target.value)} placeholder="$cashtag" autoCapitalize="none" />
                  </div>
                </div>
                <Hint className="-mt-2">Renters pay you in person. If you add a handle, they get a one-tap pay link with the right amount.</Hint>
              </div>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" className="mt-8 w-full" loading={pending} disabled={name.trim().length < 2}>
                Continue
              </Button>
            </form>
          )}

          {step === "phone" && (
            <div>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight">Add your phone?</h1>
              <p className="mt-2 text-muted">
                Optional. Next time you can sign in with a text instead of digging through {email.split("@")[1]} email.
              </p>
              {verified ? (
                <div className="mt-8 flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 text-success">
                  <Check className="size-5" /> <span className="font-semibold">Phone verified</span>
                </div>
              ) : !codeSent ? (
                <form
                  className="mt-8"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => startPhoneVerification(phone), () => setCodeSent(true));
                  }}
                >
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
                    <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="(205) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-14 pl-12 text-[17px]" autoFocus />
                  </div>
                  {error && <p className="mt-3 text-sm text-danger">{error}</p>}
                  <Button type="submit" size="lg" className="mt-6 w-full" loading={pending} disabled={phone.replace(/\D/g, "").length < 10}>
                    Text me a code
                  </Button>
                </form>
              ) : (
                <div className="mt-8">
                  <p className="mb-3 text-sm text-muted">Enter the 6-digit code we texted to {phone}.</p>
                  <CodeInput
                    value={code}
                    onChange={setCode}
                    autoFocus
                    disabled={pending}
                    onComplete={(v) => run(() => confirmPhone(phone, v), () => setVerified(true))}
                  />
                  {error && <p className="mt-3 text-sm text-danger">{error}</p>}
                  <button className="mt-4 text-sm text-muted underline-offset-4 hover:underline" onClick={() => { setCodeSent(false); setCode(""); }}>
                    Use a different number
                  </button>
                </div>
              )}
              <div className="mt-8 flex flex-col gap-2">
                <Button size="lg" className="w-full" onClick={() => { setError(null); setStep("follows"); }}>
                  {verified ? "Continue" : "Skip for now"}
                </Button>
              </div>
            </div>
          )}

          {step === "follows" && (
            <div>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight">What are you looking for?</h1>
              <p className="mt-2 text-muted">Pick a few. They shape your feed, and you can change them anytime.</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {CATEGORIES.filter((c) => c.slug !== "other").map((c) => {
                  const on = follows.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => setFollowState(on ? follows.filter((f) => f !== c.slug) : [...follows, c.slug])}
                      className={cn(
                        "flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition",
                        on ? "bg-ink text-ink-inverse" : "bg-surface ring-1 ring-line hover:ring-ink/30",
                      )}
                    >
                      <CategoryIcon slug={c.slug} className="size-4" />
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <Button
                size="lg"
                className="mt-8 w-full"
                loading={pending}
                onClick={() =>
                  run(async () => {
                    const res = await setFollows(follows);
                    if (!res.ok) return res;
                    await finishOnboarding(next);
                  })
                }
              >
                Start browsing
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
