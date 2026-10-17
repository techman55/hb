// Email is kept to what people actually need outside the app: sign-in (see auth/login.ts),
// day-of reminders, and receipts when an item changes hands. Everything else (requests,
// answers, chat, photo reviews) shows up in the app's badges and the rental's chat.
// Texts are opt-in (Me → Text alerts) and only for moments that need action: someone called
// dibs, a pickup or return was confirmed, or a new chat message while you're away. Each text
// links straight to the page; signed-out taps come back there after sign-in.
// Failures are logged and swallowed so a mail or SMS hiccup never breaks a flow.

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { chatReads, listings, messages, rentals, users } from "@/db/schema";
import { addDays, formatDay, todayISO } from "@/lib/dates";
import { noticeEmail, receiptEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { appUrl, type Env } from "@/lib/env";
import { payLinks } from "@/lib/rentals/detail";
import { sendSms } from "@/lib/sms";
import { firstName, formatMoney, plural, truncate } from "@/lib/utils";

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

/** Texts one user, only if they turned text alerts on and have a verified phone. */
async function text(env: Env, db: DB, userId: string, body: string, path: string) {
  const u = (await db.select({ phone: users.phone, verified: users.phoneVerifiedAt, on: users.smsAlerts }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!u?.on || !u.phone || !u.verified) return;
  await sendSms(env, u.phone, `Dibs: ${body} ${appUrl(env, path)}`);
}

const ownerPath = (id: string) => `/lending/rentals/${id}`;
const renterPath = (id: string) => `/dibs/${id}`;

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

  /** Text to the owner when someone calls dibs. */
  dibsRequested: (env: Env, db: DB, rentalId: string) =>
    safely(async () => {
      const ctx = await rentalParties(db, rentalId);
      if (!ctx) return;
      const { rental, title, renter } = ctx;
      await text(
        env,
        db,
        rental.ownerId,
        `${firstName(renter.name, "Someone")} called dibs on ${title}: ${plural(rental.days, "day")} from ${formatDay(rental.startDate)}, ${formatMoney(rental.totalCents)}. Accept or decline:`,
        ownerPath(rental.id),
      );
    }),

  /** Texts both people when the owner scans the pickup or return code. */
  handoffDone: (env: Env, db: DB, rentalId: string, kind: "pickup" | "return") =>
    safely(async () => {
      const ctx = await rentalParties(db, rentalId);
      if (!ctx) return;
      const { rental, title, owner, renter } = ctx;
      const due = formatDay(addDays(rental.startDate, rental.days));
      const renterName = firstName(renter.name, "The renter");
      await Promise.all([
        text(
          env,
          db,
          renter.id,
          kind === "pickup"
            ? `Pickup confirmed for ${title}. It's due back ${due}. Pay ${firstName(owner.name, "the owner")} ${formatMoney(rental.totalCents)}:`
            : `Return confirmed for ${title}. Thanks for bringing it back.`,
          renterPath(rental.id),
        ),
        text(
          env,
          db,
          owner.id,
          kind === "pickup" ? `${renterName} picked up ${title}. It's due back ${due}.` : `${title} is back with you. This rental is closed.`,
          ownerPath(rental.id),
        ),
      ]);
    }),

  /**
   * Text for a new chat message, only when the other person has no Dibs tab open and this is
   * the first message they haven't read from the sender, so a burst of messages is one text.
   */
  chatMessage: (env: Env, db: DB, rentalId: string, senderId: string, body: string, online: Set<string>) =>
    safely(async () => {
      const rental = (await db.select().from(rentals).where(eq(rentals.id, rentalId)).limit(1))[0];
      if (!rental) return;
      const to = rental.ownerId === senderId ? rental.renterId : rental.ownerId;
      if (online.has(to)) return;
      const read = (await db.select({ at: chatReads.lastReadAt }).from(chatReads).where(and(eq(chatReads.rentalId, rentalId), eq(chatReads.userId, to))).limit(1))[0];
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.rentalId, rentalId),
            eq(messages.senderId, senderId),
            read?.at ? gt(messages.createdAt, read.at) : undefined,
          ),
        );
      if (n > 1) return;
      const [sender, listing] = await Promise.all([
        db.select({ name: users.name }).from(users).where(eq(users.id, senderId)).limit(1),
        db.select({ title: listings.title }).from(listings).where(eq(listings.id, rental.listingId)).limit(1),
      ]);
      await text(
        env,
        db,
        to,
        `${firstName(sender[0]?.name, "Someone")} sent a message about ${listing[0]?.title ?? "your rental"}: "${truncate(body, 80)}" Reply:`,
        `/inbox/${rentalId}`,
      );
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
