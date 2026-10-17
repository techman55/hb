"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Mail, Phone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CodeInput } from "@/components/ui/code-input";
import { SchoolLogo } from "@/components/school-chip";
import type { LoginLookup } from "@/lib/schools/service";
import { sendLoginLink, sendPhoneLogin, verifyEmailCode, verifyPhoneLogin } from "../actions";

type Mode = "email" | "sent" | "phone" | "phone-code";

const looksComplete = (email: string) => {
  const at = email.indexOf("@");
  return at > 0 && /\.[a-z]{2,}$/i.test(email.slice(at));
};

function useSchoolLookup(email: string): LoginLookup {
  const [result, setResult] = useState<{ email: string; data: LoginLookup } | null>(null);
  const complete = looksComplete(email);

  useEffect(() => {
    if (!complete) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const res = await fetch(`/api/schools/lookup?email=${encodeURIComponent(email)}`);
        const data = (await res.json()) as LoginLookup;
        if (cancelled) return;
        setResult({ email, data });
        // A brand-new campus fetches its logo in the background; check back briefly.
        if (data.status === "supported" && data.logoPending && tries++ < 4) timer = setTimeout(run, 1500);
      } catch {
        /* offline: keep the last answer */
      }
    };
    timer = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, complete]);

  return complete && result?.email === email ? result.data : { status: "incomplete" };
}

function SchoolMatch({ lookup, appealHref }: { lookup: LoginLookup; appealHref: string }) {
  let body: React.ReactNode = null;
  if (lookup.status === "supported") {
    body = (
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-line">
        <SchoolLogo school={lookup.school} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{lookup.school.name}</p>
          <p className="text-xs text-muted">Your school is on Dibs</p>
        </div>
        <span className="flex size-6 items-center justify-center rounded-full bg-success text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      </div>
    );
  } else if (lookup.status === "new") {
    body = (
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-line">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">.edu</span>
        <p className="text-sm">
          <span className="font-semibold">First one from {lookup.name}.</span>{" "}
          <span className="text-muted">We&apos;ll set up your campus when you sign in.</span>
        </p>
      </div>
    );
  } else if (lookup.status === "unsupported" || lookup.status === "blocked" || lookup.status === "disabled") {
    const copy =
      lookup.status === "unsupported"
        ? "We don't recognize that school email. Dibs needs a .edu address."
        : lookup.status === "blocked"
          ? "That email domain can't be used on Dibs."
          : "That school isn't open on Dibs right now.";
    body = (
      <div className="flex items-start gap-3 rounded-2xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          {copy}{" "}
          {lookup.status === "unsupported" && (
            <Link href={appealHref} className="font-semibold underline underline-offset-2">
              Request access
            </Link>
          )}
        </p>
      </div>
    );
  }
  return (
    <AnimatePresence initial={false} mode="wait">
      {body && (
        <motion.div
          key={lookup.status + ("school" in lookup ? lookup.school.id + lookup.school.logoUrl : "")}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mt-3"
        >
          {body}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LoginForm({ next }: { next: string | null }) {
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lookup = useSchoolLookup(email.trim());

  const blocked = lookup.status === "unsupported" || lookup.status === "blocked" || lookup.status === "disabled";
  const appealHref = email.trim() ? `/appeal?email=${encodeURIComponent(email.trim())}` : "/appeal";

  const submitEmail = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    start(async () => {
      const res = await sendLoginLink(email.trim(), next);
      if (res.ok) {
        setCode("");
        setMode("sent");
      } else setError(res.error);
    });
  };

  const submitCode = (value = code) => {
    setError(null);
    start(async () => {
      const res =
        mode === "sent" ? await verifyEmailCode(email.trim(), value, next) : await verifyPhoneLogin(phone, value, next);
      if (res && !res.ok) {
        setError(res.error);
        setCode("");
      }
    });
  };

  const submitPhone = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    start(async () => {
      const res = await sendPhoneLogin(phone);
      if (res.ok) {
        setCode("");
        setMode("phone-code");
      } else setError(res.error);
    });
  };

  const back = () => {
    setError(null);
    setCode("");
    setMode(mode === "phone-code" ? "phone" : "email");
  };

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
        >
          {mode !== "email" && (
            <button onClick={back} className="-ml-2 mb-6 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2">
              <ArrowLeft className="size-4" /> Back
            </button>
          )}

          {mode === "email" && (
            <form onSubmit={submitEmail}>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight">Sign in with your school email</h1>
              <p className="mt-2 text-muted">New here? Same thing. We&apos;ll email you a link.</p>
              <div className="mt-8">
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@crimson.ua.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                  className="h-14 text-[17px]"
                />
                <SchoolMatch lookup={lookup} appealHref={appealHref} />
              </div>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" className="mt-6 w-full" loading={pending} disabled={!email || blocked}>
                <Mail className="size-4" /> Email me a link
              </Button>
              <div className="mt-6 flex flex-col items-center gap-3 text-sm">
                <button type="button" onClick={() => { setError(null); setMode("phone"); }} className="font-medium text-ink underline-offset-4 hover:underline">
                  Use my phone number instead
                </button>
                <Link href={appealHref} className="text-muted underline-offset-4 hover:underline">
                  No .edu email? Request access
                </Link>
              </div>
            </form>
          )}

          {(mode === "sent" || mode === "phone-code") && (
            <div>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                {mode === "sent" ? "Check your email" : "Check your texts"}
              </h1>
              <p className="mt-2 text-muted">
                {mode === "sent" ? (
                  <>
                    We sent a sign-in link to <span className="font-semibold text-ink">{email}</span>. Open it on any
                    device, or type the code from the email.
                  </>
                ) : (
                  <>If that number is on an account, we just texted it a 6-digit code.</>
                )}
              </p>
              <div className="mt-8">
                <CodeInput value={code} onChange={setCode} onComplete={submitCode} autoFocus disabled={pending} />
              </div>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <Button size="lg" className="mt-6 w-full" loading={pending} disabled={code.length !== 6} onClick={() => submitCode()}>
                Sign in
              </Button>
              <p className="mt-6 text-center text-sm text-muted">
                Didn&apos;t get it?{" "}
                <button
                  onClick={() => (mode === "sent" ? submitEmail() : submitPhone())}
                  className="font-medium text-ink underline-offset-4 hover:underline"
                  disabled={pending}
                >
                  Send again
                </button>
              </p>
            </div>
          )}

          {mode === "phone" && (
            <form onSubmit={submitPhone}>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight">Sign in with your phone</h1>
              <p className="mt-2 text-muted">Works once you&apos;ve added a phone number to your account.</p>
              <div className="relative mt-8">
                <Phone className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(205) 555-0123"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoFocus
                  required
                  className="h-14 pl-12 text-[17px]"
                />
              </div>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" className="mt-6 w-full" loading={pending} disabled={phone.replace(/\D/g, "").length < 10}>
                Text me a code
              </Button>
              <p className="mt-6 text-center text-sm text-muted">First time? Sign in with your school email first.</p>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
