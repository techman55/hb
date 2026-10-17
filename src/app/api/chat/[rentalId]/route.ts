import { eq } from "drizzle-orm";
import { z } from "zod";
import { rentals } from "@/db/schema";
import { fail, json, withUser } from "@/lib/api";
import { addMessage, chatOpen, listMessages, markRead, MAX_MESSAGE } from "@/lib/chat/service";
import { allow } from "@/lib/rate-limit";
import { db, env } from "@/lib/server";
import { getSettings } from "@/lib/settings";

type Ctx = RouteContext<"/api/chat/[rentalId]">;

async function membership(rentalId: string, userId: string) {
  const rental = (await db().select().from(rentals).where(eq(rentals.id, rentalId)).limit(1))[0];
  return rental && (rental.renterId === userId || rental.ownerId === userId) ? rental : null;
}

/** Polling fallback and read receipts. `?after=<ms>` returns only newer messages. */
export const GET = withUser<Ctx>(async (req, user, { params }) => {
  const { rentalId } = await params;
  const rental = await membership(rentalId, user.id);
  if (!rental) return fail("Not found.", 404);
  const after = Number(new URL(req.url).searchParams.get("after")) || undefined;
  const messages = await listMessages(db(), rentalId, after);
  await markRead(db(), rentalId, user.id);
  return json({ messages, status: rental.status });
});

const Body = z.object({ body: z.string().trim().min(1).max(MAX_MESSAGE) });

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { rentalId } = await params;
  const rental = await membership(rentalId, user.id);
  if (!rental) return fail("Not found.", 404);
  const settings = await getSettings(db());
  if (!chatOpen(rental, settings.chatRetentionDays)) return fail("This chat is closed.", 409);
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail(`Messages can be up to ${MAX_MESSAGE} characters.`);
  if (!(await allow(env(), "AUTH_LIMITER", `chat:${user.id}`))) return fail("You're sending messages too fast.", 429);
  const message = await addMessage(env(), db(), rentalId, user.id, parsed.data.body);
  return json({ message });
});
