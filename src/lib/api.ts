import "server-only";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { listings, type User } from "@/db/schema";
import { apiUser } from "@/lib/auth/current";
import { db } from "@/lib/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(error: string, status = 400) {
  return json({ error }, status);
}

/** Wraps a route handler so it only runs for a signed-in, onboarded user. */
export function withUser<C>(handler: (req: Request, user: User, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const user = await apiUser();
    if (!user) return fail("Sign in first.", 401);
    try {
      return await handler(req, user, ctx);
    } catch (err) {
      console.error(req.method, new URL(req.url).pathname, err);
      return fail("Something went wrong. Try again.", 500);
    }
  };
}

export async function ownListing(id: string, user: User) {
  const listing = (await db().select().from(listings).where(eq(listings.id, id)).limit(1))[0];
  return listing && listing.ownerId === user.id && listing.status !== "removed" ? listing : null;
}
