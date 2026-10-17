import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, json, withUser } from "@/lib/api";
import { allow } from "@/lib/rate-limit";
import { confirmHandoff } from "@/lib/rentals/service";
import { db, env } from "@/lib/server";

type Ctx = RouteContext<"/api/rentals/[id]/handoff">;

const Body = z.object({ code: z.string().min(6).max(200) });

/** Owner confirms a pickup or return by scanning or typing the renter's code. */
export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail("Scan the code or type the 6 digits.");
  if (!(await allow(env(), "AUTH_LIMITER", `handoff:${id}`))) return fail("Too many tries. Wait a minute.", 429);
  const res = await confirmHandoff(env(), db(), user, id, parsed.data.code);
  if (!res.ok) return fail(res.error, 422);
  revalidatePath("/", "layout");
  return json(res);
});
