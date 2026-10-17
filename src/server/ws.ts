import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rentals } from "@/db/schema";
import { readCookie, sessionCookieName, validateSessionToken } from "@/lib/auth/session";

/** `/ws/chat/:rentalId` — authenticates the session cookie, then hands the socket to the room. */
export async function handleChatSocket(request: Request, env: CloudflareEnv): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket", { status: 426 });
  }
  const rentalId = new URL(request.url).pathname.split("/")[3];
  if (!rentalId) return new Response("Not found", { status: 404 });

  const db = getDb(env);
  const user = await validateSessionToken(db, readCookie(request.headers.get("cookie"), sessionCookieName(env)));
  if (!user) return new Response("Unauthorized", { status: 401 });

  const rental = (await db.select().from(rentals).where(eq(rentals.id, rentalId)).limit(1))[0];
  if (!rental || (rental.renterId !== user.id && rental.ownerId !== user.id)) {
    return new Response("Not found", { status: 404 });
  }

  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(rentalId));
  const headers = new Headers(request.headers);
  headers.set("x-dibs-user", user.id);
  return stub.fetch(new Request(request.url, { headers }));
}
