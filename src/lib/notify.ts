// Email is kept to what people actually need outside the app: sign-in (see auth/login.ts),
// day-of reminders, and receipts when an item changes hands. Everything else (requests,
// answers, chat, photo reviews) shows up in the app's badges and the rental's chat.
// Failures are logged and swallowed so a mail hiccup never breaks a flow.

import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { listings, rentals, users } from "@/db/schema";
import { addDays, formatDay, todayISO } from "@/lib/dates";
import { noticeEmail, receiptEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { appUrl, type Env } from "@/lib/env";
import { payLinks } from "@/lib/rentals/detail";
import { firstName, formatMoney, plural } from "@/lib/utils";

async function safely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error("notify failed", err);
  }
}

async function rentalParties(db: DB, rentalId: string) {
  const rental = (await db.select().from(rentals).where(eq(rentals.id, rentalId)).limit(1))[0];
  if (!rental) return null;
  const [listing] = await db.select({ title: listings.title }).from(listings).where(eq(listings.id, rental.listingId)).limit(1);
  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, venmo: users.venmo, cashapp: users.cashapp })
    .from(users)
    .where(inArray(users.id, [rental.ownerId, rental.renterId]));
  const owner = people.find((u) => u.id === rental.ownerId);
  const renter = people.find((u) => u.id === rental.renterId);
  if (!owner || !renter) return null;
  return { rental, title: listing?.title ?? "your rental", owner, renter };
}

const day = (d: Date | null) => formatDay(todayISO(undefined, d ?? new Date()));

export const notify = {
  /** Morning of pickup or return day, to one side of the rental. */
  reminder: (env: Env, db: DB, userId: string, info: { title: string; kind: "pickup" | "return"; role: "owner" | "renter"; otherName: string | null; path: string }) =>
    safely(async () => {
      const u = (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0];
      if (!u) return;
      const other = firstName(info.otherName, info.role === "owner" ? "the renter" : "the owner");
      const lines =
        info.kind === "pickup"
          ? info.role === "renter"
            ? [`You're picking up ${info.title} from ${other} today.`, "Open your code when you meet. They'll scan it to start the rental."]
            : [`${other} is picking up ${info.title} today.`, "Scan their code when you hand it over to start the rental."]
          : info.role === "renter"
            ? [`${info.title} is due back to ${other} today.`, "Open your return code when you meet. They'll scan it to close things out."]
            : [`${other} is returning ${info.title} today.`, "Scan their return code when you get it back."];
      await sendEmail(
        env,
        noticeEmail({
          to: u.email,
          subject: info.kind === "pickup" ? `Pickup today: ${info.title}` : `Return due today: ${info.title}`,
          lines: [...lines, "Use the chat to agree on a time and place."],
          cta: { label: info.role === "renter" ? "Open my code" : "Open rental", url: appUrl(env, info.path) },
        }),
      );
    }),

  /** Sent to both people when the owner scans the pickup or return code. */
  receipt: (env: Env, db: DB, rentalId: string, kind: "pickup" | "return") =>
    safely(async () => {
      const ctx = await rentalParties(db, rentalId);
      if (!ctx) return;
      const { rental, title, owner, renter } = ctx;
      const total = formatMoney(rental.totalCents);
      const rate = `${formatMoney(rental.priceCents)}/day × ${plural(rental.days, "day")}`;
      const due = formatDay(addDays(rental.startDate, rental.days));
      const ref = rental.id.slice(-8).toUpperCase();

      for (const role of ["renter", "owner"] as const) {
        const me = role === "renter" ? renter : owner;
        const other = role === "renter" ? owner : renter;
        const otherName = other.name ?? (role === "renter" ? "The owner" : "The renter");
        const rows: [string, string][] =
          kind === "pickup"
            ? [
                ["Item", title],
                [role === "renter" ? "From" : "Rented to", otherName],
                ["Picked up", day(rental.pickedUpAt)],
                ["Due back", due],
                ["Rate", rate],
                ["Receipt", ref],
              ]
            : [
                ["Item", title],
                [role === "renter" ? "From" : "Rented to", otherName],
                ["Picked up", day(rental.pickedUpAt)],
                ["Returned", day(rental.returnedAt)],
                ["Rate", rate],
                ["Receipt", ref],
              ];
        const intro =
          kind === "pickup"
            ? role === "renter"
              ? `You picked up ${title} from ${firstName(other.name, "the owner")}. Bring it back by ${due}.`
              : `${firstName(other.name, "The renter")} picked up ${title}. It's due back ${due}.`
            : role === "renter"
              ? `You returned ${title}. Thanks for bringing it back.`
              : `${title} is back with you. This rental is closed.`;
        const links = kind === "pickup" && role === "renter" ? payLinks(owner, rental.totalCents, title).map((l) => ({ label: l.label, url: l.href })) : [];
        await sendEmail(
          env,
          receiptEmail({
            to: me.email,
            subject: kind === "pickup" ? `Receipt: ${title} picked up` : `Receipt: ${title} returned`,
            intro,
            rows,
            total: { label: kind === "pickup" ? "Total due" : "Total", value: total },
            links,
            footnote:
              kind === "pickup"
                ? role === "renter"
                  ? "Pay the owner directly. Dibs doesn't handle payments."
                  : "Payment goes straight between you two. Dibs doesn't handle payments."
                : "Pickup and return were both verified in person with a Dibs code.",
            cta: { label: "View rental", url: appUrl(env, role === "renter" ? `/dibs/${rental.id}` : `/lending/rentals/${rental.id}`) },
          }),
        );
      }
    }),

  /** People who appealed don't have an account yet, so email is the only way to reach them. */
  appealDecision: (env: Env, to: string, approved: boolean, note?: string | null) =>
    safely(() =>
      sendEmail(
        env,
        noticeEmail({
          to,
          subject: approved ? "You're approved for Dibs" : "About your Dibs access request",
          lines: approved
            ? ["Your access request was approved. Sign in with this email to get started."]
            : ["We couldn't approve your access request.", ...(note ? [note] : [])],
          cta: approved ? { label: "Sign in", url: appUrl(env, "/login") } : undefined,
        }),
      ),
    ),
};
