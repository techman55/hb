"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, FileText, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint, Input, Label, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { submitAppeal } from "./actions";
import { EVIDENCE_ACCEPT, EVIDENCE_TYPES, MAX_EVIDENCE_BYTES, REASON_MAX, type EvidenceType } from "./rules";

type Suggestion = { id: string | null; name: string; detail: string | null };

const EXTENSION_TYPES: Record<string, EvidenceType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

// Some browsers leave File.type empty, so fall back to the extension.
function evidenceType(file: File): EvidenceType | null {
  if ((EVIDENCE_TYPES as readonly string[]).includes(file.type)) return file.type as EvidenceType;
  return EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function useSchoolSuggestions(query: string) {
  const [results, setResults] = useState<{ q: string; items: Suggestion[] }>({ q: "", items: [] });
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current;
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/appeals/schools?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { results: Suggestion[] };
        if (id === seq.current) setResults({ q, items: data.results });
      } catch {
        /* suggestions are optional; free text still works */
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return query.trim().length >= 2 && results.q === query.trim() ? results.items : [];
}

function SchoolField({ value, onChange, onPick }: { value: string; onChange: (v: string) => void; onPick: (s: Suggestion) => void }) {
  const items = useSchoolSuggestions(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const show = open && items.length > 0;

  const pick = (s: Suggestion) => {
    onPick(s);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + items.length) % items.length);
    } else if (e.key === "Enter" && show && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        id="appeal-school"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Start typing your school's name"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        maxLength={120}
        required
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching schools"
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl"
          // Keep focus in the input so the list doesn't close before the click lands.
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((s, i) => (
            <li
              key={`${s.id ?? "dir"}:${s.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={() => pick(s)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2", i === active && "bg-surface-2")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                {s.detail && s.id == null && <p className="truncate text-xs text-muted">{s.detail}</p>}
              </div>
              {s.id && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">On Dibs</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidencePicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">
        Proof <span className="font-normal text-muted">(optional)</span>
      </p>
      <input
        ref={inputRef}
        id="appeal-evidence"
        type="file"
        accept={EVIDENCE_ACCEPT}
        className="peer sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label="Remove file"
            className="rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor="appeal-evidence"
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3.5 text-sm text-muted transition hover:border-ink/40 hover:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        >
          <Paperclip className="size-4 shrink-0" />
          Add a photo of your student ID or enrollment letter
        </label>
      )}
      <Hint>JPG, PNG, WebP or PDF up to 8 MB. Only our review team can see it.</Hint>
    </div>
  );
}

export function AppealForm({ initialEmail }: { initialEmail: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [school, setSchool] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; uploadFailed: boolean } | null>(null);
  const [pending, start] = useTransition();

  const pickFile = (f: File | null) => {
    setError(null);
    if (f && !evidenceType(f)) return setError("Proof can be a JPG, PNG, WebP or PDF.");
    if (f && f.size > MAX_EVIDENCE_BYTES) return setError("That file is over 8 MB. Try a smaller photo or a PDF.");
    setFile(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const type = file ? evidenceType(file) : null;
    start(async () => {
      let res: Awaited<ReturnType<typeof submitAppeal>>;
      try {
        res = await submitAppeal({
          name,
          email,
          schoolName: school,
          schoolId,
          reason,
          evidence: file && type ? { type, size: file.size } : null,
        });
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      let uploadFailed = false;
      if (res.upload && file && type) {
        try {
          const up = await fetch(res.upload.url, {
            method: "PUT",
            body: file,
            headers: {
              "content-type": type,
              "x-upload-token": res.upload.token,
              "x-file-name": encodeURIComponent(file.name.slice(0, 120)),
            },
          });
          uploadFailed = !up.ok;
        } catch {
          uploadFailed = true;
        }
      }
      setDone({ email: res.email, uploadFailed });
    });
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <motion.div key="done" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-6" strokeWidth={2.5} />
          </span>
          <h1 className="mt-6 text-[32px] font-bold leading-tight tracking-tight">Request sent</h1>
          <p className="mt-2 text-muted">
            Thanks. We&apos;ll email you at <span className="font-semibold text-ink">{done.email}</span> once someone
            reviews it.
          </p>
          {done.uploadFailed && (
            <p className="mt-4 rounded-2xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
              Your file didn&apos;t upload, but the request went through. If we need proof, we&apos;ll ask by email.
            </p>
          )}
          <Button asChild size="lg" variant="secondary" className="mt-8 w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </motion.div>
      ) : (
        <motion.div key="form" exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
          <Link
            href="/login"
            className="-ml-2 mb-6 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">Request access</h1>
          <p className="mt-2 text-muted">
            No .edu email at your school? Tell us who you are and someone on our team will take a look.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
            <div>
              <Label htmlFor="appeal-name">Full name</Label>
              <Input
                id="appeal-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
              />
            </div>
            <div>
              <Label htmlFor="appeal-email">Email</Label>
              <Input
                id="appeal-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@yourschool.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                required
              />
              <Hint>The address you want to sign in with.</Hint>
            </div>
            <div>
              <Label htmlFor="appeal-school">School</Label>
              <SchoolField
                value={school}
                onChange={(v) => {
                  setSchool(v);
                  setSchoolId(null);
                }}
                onPick={(s) => {
                  setSchool(s.name);
                  setSchoolId(s.id);
                }}
              />
            </div>
            <div>
              <Label htmlFor="appeal-reason">Why do you need access?</Label>
              <Textarea
                id="appeal-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                placeholder="For example: my school gives students @college.org addresses."
                required
              />
              <Hint className="text-right tabular-nums">
                {reason.length}/{REASON_MAX}
              </Hint>
            </div>
            <EvidencePicker file={file} onChange={pickFile} />

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={pending}>
              Send request
            </Button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
