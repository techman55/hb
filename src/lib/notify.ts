// Transactional emails. Failures are logged and swallowed so a mail hiccup never breaks a flow.

import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { users } from "@/db/schema";
import { noticeEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { appUrl, type Env } from "@/lib/env";
import { firstName } from "@/lib/utils";

async function emailUser(
  env: Env,
  db: DB,
  userId: string,
  build: (u: { name: string | null; email: string }) => { subject: string; lines: string[]; cta?: { label: string; path: string } },
) {
  try {
    const u = (await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!u) return;
    const msg = build(u);
    await sendEmail(
      env,
      noticeEmail({
        to: u.email,
        subject: msg.subject,
        lines: msg.lines,
        cta: msg.cta ? { label: msg.cta.label, url: appUrl(env, msg.cta.path) } : undefined,
      }),
    );
  } catch (err) {
    console.error("notify failed", err);
  }
}

export const notify = {
  listingLive: (env: Env, db: DB, ownerId: string, listing: { id: string; title: string }) =>
    emailUser(env, db, ownerId, (u) => ({
      subject: `${listing.title} is live`,
      lines: [`Hey ${firstName(u.name)}, your photos checked out and ${listing.title} is now visible to renters.`],
      cta: { label: "View listing", path: `/listing/${listing.id}` },
    })),

  photoHeld: (env: Env, db: DB, ownerId: string, listing: { id: string; title: string }) =>
    emailUser(env, db, ownerId, (u) => ({
      subject: `A photo for ${listing.title} needs a quick review`,
      lines: [
        `Hey ${firstName(u.name)}, one of your photos for ${listing.title} couldn't be verified automatically, so a person on our team will take a look.`,
        "Dibs only allows real photos of the actual item, not AI-generated or AI-edited images. You can also replace the photo from your listing.",
      ],
      cta: { label: "Open listing", path: `/lending/${listing.id}` },
    })),

  photoRejected: (env: Env, db: DB, ownerId: string, listing: { id: string; title: string }, note?: string | null) =>
    emailUser(env, db, ownerId, (u) => ({
      subject: `Please replace a photo for ${listing.title}`,
      lines: [
        `Hey ${firstName(u.name)}, a photo for ${listing.title} looks AI-generated or AI-edited, so we couldn't publish it.`,
        ...(note ? [`Reviewer note: ${note}`] : []),
        "Take a new photo of the item and your listing will go live once it checks out.",
      ],
      cta: { label: "Replace photo", path: `/lending/${listing.id}` },
    })),

  dibsRequested: (env: Env, db: DB, ownerId: string, info: { rentalId: string; title: string; renterName: string | null; when: string }) =>
    emailUser(env, db, ownerId, () => ({
      subject: `${info.renterName ?? "Someone"} called dibs on ${info.title}`,
      lines: [`${info.renterName ?? "A student"} wants to rent ${info.title} starting ${info.when}. Accept or decline from Lending.`],
      cta: { label: "Review request", path: `/lending/rentals/${info.rentalId}` },
    })),

  dibsAnswered: (env: Env, db: DB, renterId: string, info: { rentalId: string; title: string; accepted: boolean; when: string }) =>
    emailUser(env, db, renterId, () => ({
      subject: info.accepted ? `You've got dibs on ${info.title}` : `${info.title} isn't available`,
      lines: info.accepted
        ? [`Your request was accepted. Pickup is ${info.when}. Use the chat to agree on a spot, then show your code at pickup.`]
        : ["The owner couldn't do those dates. Try different dates or find something similar on Dibs."],
      cta: info.accepted ? { label: "Open My Dibs", path: `/dibs/${info.rentalId}` } : { label: "Browse", path: "/" },
    })),

  rentalCancelled: (env: Env, db: DB, userId: string, info: { rentalId: string; title: string; byName: string | null }) =>
    emailUser(env, db, userId, () => ({
      subject: `Dibs on ${info.title} was cancelled`,
      lines: [`${info.byName ?? "The other person"} cancelled the rental for ${info.title}.`],
      cta: { label: "Open Dibs", path: "/" },
    })),

  reminder: (env: Env, db: DB, userId: string, info: { title: string; kind: "pickup" | "return"; path: string }) =>
    emailUser(env, db, userId, () => ({
      subject: info.kind === "pickup" ? `Pickup today: ${info.title}` : `Return due today: ${info.title}`,
      lines: [
        info.kind === "pickup"
          ? `Today's the pickup for ${info.title}. The renter shows their code and the owner scans it.`
          : `${info.title} is due back today. Scan the return code when you hand it over.`,
      ],
      cta: { label: "Open", path: info.path },
    })),

  unreadMessages: (env: Env, db: DB, userId: string, info: { title: string; path: string; preview: string }) =>
    emailUser(env, db, userId, () => ({
      subject: `New message about ${info.title}`,
      lines: [`“${info.preview}”`],
      cta: { label: "Reply", path: info.path },
    })),

  appealDecision: async (env: Env, to: string, approved: boolean, note?: string | null) => {
    try {
      await sendEmail(
        env,
        noticeEmail({
          to,
          subject: approved ? "You're approved for Dibs" : "About your Dibs access request",
          lines: approved
            ? ["Your access request was approved. Sign in with this email to get started."]
            : ["We couldn't approve your access request.", ...(note ? [note] : [])],
          cta: approved ? { label: "Sign in", url: appUrl(env, "/login") } : undefined,
        }),
      );
    } catch (err) {
      console.error("notify failed", err);
    }
  },
};
