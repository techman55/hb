// A per-user channel for "something changed, refresh". Each signed-in tab holds one socket on
// `/ws/me`; it lives in a ChatRoom Durable Object named `user:<id>` (same class as chat threads).

import type { Env } from "@/lib/env";

export type LiveEvent = { type: "inbox" | "friends" | "rentals" };

const room = (env: Env, userId: string) => env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(`user:${userId}`));

export const userRoomName = (userId: string) => `user:${userId}`;

/** Tells each user's open tabs to refresh. Returns the ids that had at least one tab open. */
export async function pushToUsers(env: Env, userIds: string[], event: LiveEvent): Promise<Set<string>> {
  const online = new Set<string>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      try {
        if ((await room(env, id).broadcast(JSON.stringify(event))) > 0) online.add(id);
      } catch {
        // No Durable Object in `next dev`; the page polls instead.
      }
    }),
  );
  return online;
}
