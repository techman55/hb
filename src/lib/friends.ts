import { and, eq, or } from "drizzle-orm";
import type { DB } from "@/db";
import { friendships, users } from "@/db/schema";
import { newId } from "@/lib/crypto";

export type FriendState = "none" | "friends" | "outgoing" | "incoming" | "self";

export async function friendIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ a: friendships.requesterId, b: friendships.addresseeId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    );
  return rows.map((r) => (r.a === userId ? r.b : r.a));
}

export async function friendState(db: DB, me: string, other: string): Promise<FriendState> {
  if (me === other) return "self";
  const row = (
    await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, me), eq(friendships.addresseeId, other)),
          and(eq(friendships.requesterId, other), eq(friendships.addresseeId, me)),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === me ? "outgoing" : "incoming";
}

/** Sends a request, or accepts theirs if they already asked. */
export async function addFriend(db: DB, me: string, other: string): Promise<FriendState> {
  const state = await friendState(db, me, other);
  if (state === "incoming") {
    await db
      .update(friendships)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(and(eq(friendships.requesterId, other), eq(friendships.addresseeId, me)));
    return "friends";
  }
  if (state !== "none") return state;
  await db.insert(friendships).values({ id: newId("frd"), requesterId: me, addresseeId: other }).onConflictDoNothing();
  return "outgoing";
}

export async function respondToFriend(db: DB, me: string, other: string, accept: boolean) {
  const where = and(eq(friendships.requesterId, other), eq(friendships.addresseeId, me), eq(friendships.status, "pending"));
  if (accept) await db.update(friendships).set({ status: "accepted", respondedAt: new Date() }).where(where);
  else await db.delete(friendships).where(where);
}

export async function removeFriend(db: DB, me: string, other: string) {
  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, me), eq(friendships.addresseeId, other)),
        and(eq(friendships.requesterId, other), eq(friendships.addresseeId, me)),
      ),
    );
}

export async function incomingRequests(db: DB, me: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, schoolId: users.schoolId, at: friendships.createdAt })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, me), eq(friendships.status, "pending")));
}
