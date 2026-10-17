import { eq } from "drizzle-orm";
import { accessAppeals } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { db, env } from "@/lib/server";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

/** Streams an appeal's private proof file. Admins only; everyone else gets a plain 404. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/appeals/[id]/evidence">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return notFound();

  const { id } = await params;
  const appeal = (
    await db().select({ evidenceKey: accessAppeals.evidenceKey }).from(accessAppeals).where(eq(accessAppeals.id, id)).limit(1)
  )[0];
  if (!appeal?.evidenceKey) return notFound();
  const object = await env().UPLOADS.get(appeal.evidenceKey);
  if (!object) return notFound();

  const name = object.customMetadata?.name || "proof";
  const asciiName = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "content-disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  if (object.size) headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
