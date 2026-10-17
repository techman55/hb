// One chat thread per rental, only between the renter and the owner. Messages live in D1; the
// ChatRoom Durable Object just pushes them to open sockets.

import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { chatReads, messages, rentals, type Message, type Rental } from "@/db/schema";
import { newId } from "@/lib/crypto";
import type { Env } from "@/lib/env";
import { pushToUsers } from "@/lib/live";

export const MAX_MESSAGE = 500;
const OPEN = new Set(["requested", "accepted", "active"]);

export function chatOpen(rental: Pick<Rental, "status" | "closedAt" | "returnedAt">, retentionDays: number, now = Date.now()): boolean {
  if (OPEN.has(rental.status)) return true;
  const ended = rental.closedAt ?? rental.returnedAt;
  return !!ended && now - ended.getTime() < retentionDays * 86_400_000;
}

export type ChatMessage = { id: string; senderId: string | null; kind: "text" | "system"; body: string; createdAt: number };

export const toChat = (m: Message): ChatMessage => ({
  id: m.id,
  senderId: m.senderId,
  kind: m.kind,
  body: m.body,
  createdAt: m.createdAt.getTime(),
});

async function broadcast(env: Env, rentalId: string, message: ChatMessage) {
  try {
    const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(rentalId));
    await stub.broadcast(JSON.stringify({ type: "message", message }));
  } catch {
    // No Durable Object in `next dev`; clients fall back to polling.
  }
}

export async function addMessage(
  env: Env,
  db: DB,
  rentalId: string,
  senderId: string | null,
  body: string,
  kind: "text" | "system" = "text",
): Promise<ChatMessage & { online: Set<string> }> {
  const row = { id: newId("msg"), rentalId, senderId, kind, body: body.slice(0, MAX_MESSAGE), createdAt: new Date() };
  await db.insert(messages).values(row);
  if (senderId) await markRead(db, rentalId, senderId);
  const msg = toChat(row as Message);
  await broadcast(env, rentalId, msg);
  // Inbox lists and badges for both people (also covers every rental status change, since each posts a system message).
  const parties = (await db.select({ a: rentals.ownerId, b: rentals.renterId }).from(rentals).where(eq(rentals.id, rentalId)).limit(1))[0];
  const online = parties ? await pushToUsers(env, [parties.a, parties.b], { type: "inbox" }) : new Set<string>();
  return Object.assign(msg, { online });
}

export const systemMessage = (env: Env, db: DB, rentalId: string, body: string) =>
  addMessage(env, db, rentalId, null, body, "system");

export async function listMessages(db: DB, rentalId: string, after?: number) {
  const rows = await db
    .select()
    .from(messages)
    .where(after ? and(eq(messages.rentalId, rentalId), gt(messages.createdAt, new Date(after))) : eq(messages.rentalId, rentalId))
    .orderBy(asc(messages.createdAt))
    .limit(300);
  return rows.map(toChat);
}

export async function markRead(db: DB, rentalId: string, userId: string) {
  await db
    .insert(chatReads)
    .values({ rentalId, userId, lastReadAt: new Date() })
    .onConflictDoUpdate({ target: [chatReads.rentalId, chatReads.userId], set: { lastReadAt: new Date() } });
}

export type ThreadSummary = {
  rentalId: string;
  status: string;
  title: string;
  cover: string | null;
  otherId: string;
  otherName: string | null;
  role: "owner" | "renter";
  lastBody: string | null;
  lastKind: string | null;
  lastAt: number | null;
  unread: number;
};

export async function listThreads(db: DB, me: string): Promise<ThreadSummary[]> {
  const rows = await db.all<{
    rental_id: string;
    status: string;
    title: string;
    cover: string | null;
    owner_id: string;
    renter_id: string;
    other_name: string | null;
    last_body: string | null;
    last_kind: string | null;
    last_at: number | null;
    created_at: number;
    unread: number;
  }>(sql`
    SELECT r.id AS rental_id, r.status, l.title, r.owner_id, r.renter_id, r.created_at,
      (SELECT COALESCE(thumb_key, display_key) FROM listing_photos WHERE listing_id = l.id ORDER BY position LIMIT 1) AS cover,
      (SELECT name FROM users WHERE id = CASE WHEN r.owner_id = ${me} THEN r.renter_id ELSE r.owner_id END) AS other_name,
      (SELECT body FROM messages WHERE rental_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_body,
      (SELECT kind FROM messages WHERE rental_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_kind,
      (SELECT MAX(created_at) FROM messages WHERE rental_id = r.id) AS last_at,
      (SELECT COUNT(*) FROM messages m WHERE m.rental_id = r.id AND (m.sender_id IS NULL OR m.sender_id != ${me})
         AND m.created_at > COALESCE((SELECT last_read_at FROM chat_reads WHERE rental_id = r.id AND user_id = ${me}), 0)) AS unread
    FROM rentals r JOIN listings l ON l.id = r.listing_id
    WHERE r.owner_id = ${me} OR r.renter_id = ${me}
    ORDER BY COALESCE(last_at, r.created_at) DESC
    LIMIT 100`);
  return rows.map((r) => ({
    rentalId: r.rental_id,
    status: r.status,
    title: r.title,
    cover: r.cover,
    otherId: r.owner_id === me ? r.renter_id : r.owner_id,
    otherName: r.other_name,
    role: r.owner_id === me ? "owner" : "renter",
    lastBody: r.last_body,
    lastKind: r.last_kind,
    lastAt: r.last_at,
    unread: r.unread,
  }));
}
