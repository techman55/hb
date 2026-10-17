"use server";

import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { accessAppeals, emailOverrides, schoolDomains, schools } from "@/db/schema";
import { signEvidenceToken } from "@/app/api/appeals/evidence-token";
import { newId } from "@/lib/crypto";
import { sendEmail } from "@/lib/email/send";
import { noticeEmail } from "@/lib/email/templates";
import { appUrl, type Env } from "@/lib/env";
import { allow } from "@/lib/rate-limit";
import { domainCandidates, emailDomain, isEduDomain, isValidEmail } from "@/lib/schools/domains";
import { db, env, waitUntil } from "@/lib/server";
import { EVIDENCE_TYPES, MAX_EVIDENCE_BYTES, REASON_MAX } from "./rules";

const Input = z.object({
  name: z.string().trim().min(2, "Add your full name.").max(80, "That name is a bit long."),
  email: z.string().trim().toLowerCase().refine(isValidEmail, "That doesn't look like an email address."),
  schoolName: z.string().trim().min(2, "Tell us which school you go to.").max(120, "That school name is a bit long."),
  schoolId: z.string().max(40).nullish(),
  reason: z
    .string()
    .trim()
    .min(1, "Tell us a little about why you need access.")
    .max(REASON_MAX, `Keep it under ${REASON_MAX} characters.`),
  evidence: z
    .object({
      type: z.enum(EVIDENCE_TYPES, "Proof can be a JPG, PNG, WebP or PDF."),
      size: z.number().int().positive().max(MAX_EVIDENCE_BYTES, "Proof files can be up to 8 MB."),
    })
    .nullish(),
});

type Result =
  | { ok: true; email: string; upload: { url: string; token: string } | null }
  | { ok: false; error: string };

async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for") ?? "local";
}

/** Sends people who don't need an appeal back to sign-in instead of into the review queue. */
async function alreadyAllowed(d: DB, email: string): Promise<string | null> {
  const override = await d.select({ email: emailOverrides.email }).from(emailOverrides).where(eq(emailOverrides.email, email)).limit(1);
  if (override.length) return "This email is already approved. Sign in with it.";

  const domain = emailDomain(email);
  if (!domain) return null;
  const candidates = domainCandidates(domain);
  const rows = await d
    .select({ domain: schoolDomains.domain, kind: schoolDomains.kind })
    .from(schoolDomains)
    .where(inArray(schoolDomains.domain, candidates));
  const match = candidates.map((c) => rows.find((r) => r.domain === c)).find(Boolean);
  if (match?.kind === "blocked") return null;
  if (match) return "You can already sign in with this email.";
  return isEduDomain(domain) ? "That's a .edu address, so you can sign in with it directly." : null;
}

async function tellSupport(e: Env, appeal: { name: string; email: string; schoolName: string; reason: string }) {
  if (!e.SUPPORT_EMAIL) return;
  try {
    await sendEmail(e, {
      ...noticeEmail({
        to: e.SUPPORT_EMAIL,
        subject: `Access request from ${appeal.name}`,
        lines: [`${appeal.name} (${appeal.email}) asked for access at ${appeal.schoolName}.`, `“${appeal.reason}”`],
        cta: { label: "Review requests", url: appUrl(e, "/admin/appeals") },
      }),
      replyTo: appeal.email,
    });
  } catch (err) {
    console.error("appeal notice failed", err);
  }
}

export async function submitAppeal(raw: z.input<typeof Input>): Promise<Result> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const input = parsed.data;
  const e = env();
  const d = db();

  if (
    !(await allow(e, "AUTH_LIMITER", `appeal-ip:${await clientIp()}`)) ||
    !(await allow(e, "AUTH_LIMITER", `appeal:${input.email}`))
  ) {
    return { ok: false, error: "Too many tries. Wait a minute and try again." };
  }

  try {
    const notNeeded = await alreadyAllowed(d, input.email);
    if (notNeeded) return { ok: false, error: notNeeded };

    // One open request per address. Asking again shows the same confirmation without a duplicate.
    const pending = await d
      .select({ id: accessAppeals.id })
      .from(accessAppeals)
      .where(and(eq(accessAppeals.email, input.email), eq(accessAppeals.status, "pending")))
      .limit(1);
    if (pending.length) return { ok: true, email: input.email, upload: null };

    const school = input.schoolId
      ? (await d.select({ id: schools.id }).from(schools).where(eq(schools.id, input.schoolId)).limit(1))[0]
      : undefined;

    const id = newId("apl");
    const upload = input.evidence ? { url: `/api/appeals/${id}/evidence`, token: await signEvidenceToken(e, id) } : null;
    await d.insert(accessAppeals).values({
      id,
      email: input.email,
      name: input.name,
      schoolName: input.schoolName,
      schoolId: school?.id ?? null,
      reason: input.reason,
    });
    waitUntil(tellSupport(e, input));
    return { ok: true, email: input.email, upload };
  } catch (err) {
    console.error("submitAppeal", err);
    return { ok: false, error: "We couldn't send that. Try again in a moment." };
  }
}
