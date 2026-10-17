import { and, eq, isNull } from "drizzle-orm";
import { accessAppeals } from "@/db/schema";
import { MAX_EVIDENCE_BYTES } from "@/app/(auth)/appeal/rules";
import { fail, json } from "@/lib/api";
import { randomToken } from "@/lib/crypto";
import { db, env } from "@/lib/server";
import { sniffFormat } from "@/lib/verify/metadata";
import { verifyEvidenceToken } from "../../evidence-token";

/** Reads the body but stops as soon as it passes `max`, so an oversized upload never sits in memory. */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Trust the bytes, not the client's content-type: admins open these files in their browser. */
function evidenceType(bytes: Uint8Array): string | null {
  const format = sniffFormat(bytes);
  if (format === "jpeg" || format === "png" || format === "webp") return `image/${format}`;
  if (String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

function fileName(header: string | null): string | null {
  if (!header) return null;
  try {
    const name = [...decodeURIComponent(header)]
      .filter((c) => c.charCodeAt(0) >= 32 && !`"\\/`.includes(c))
      .join("")
      .trim()
      .slice(0, 120);
    return name || null;
  } catch {
    return null;
  }
}

/** Stores the optional proof for an access appeal, privately, in UPLOADS. Only admins can read it back. */
export async function PUT(request: Request, { params }: RouteContext<"/api/appeals/[id]/evidence">) {
  const { id } = await params;
  try {
    const e = env();
    const token = request.headers.get("x-upload-token") ?? "";
    if (!(await verifyEvidenceToken(e, id, token))) return fail("This upload link expired. Send your request again.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_EVIDENCE_BYTES) return fail("Files can be up to 8 MB.", 413);

    const d = db();
    const appeal = (
      await d
        .select({ status: accessAppeals.status, evidenceKey: accessAppeals.evidenceKey })
        .from(accessAppeals)
        .where(eq(accessAppeals.id, id))
        .limit(1)
    )[0];
    if (!appeal || appeal.status !== "pending" || appeal.evidenceKey) return fail("This request already has a file.", 409);

    const bytes = await readCapped(request.body, MAX_EVIDENCE_BYTES);
    if (!bytes) return fail("Files can be up to 8 MB.", 413);
    const type = evidenceType(bytes);
    if (!type) return fail("Use a JPG, PNG, WebP or PDF.", 415);

    const name = fileName(request.headers.get("x-file-name"));
    const key = `appeals/${id}/${randomToken(12)}`;
    await e.UPLOADS.put(key, bytes, {
      httpMetadata: { contentType: type },
      customMetadata: name ? { name } : undefined,
    });
    const saved = await d
      .update(accessAppeals)
      .set({ evidenceKey: key })
      .where(and(eq(accessAppeals.id, id), isNull(accessAppeals.evidenceKey)))
      .returning({ id: accessAppeals.id });
    if (!saved.length) {
      // Another upload for this appeal won the race; drop ours rather than orphan it.
      await e.UPLOADS.delete(key);
      return fail("This request already has a file.", 409);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("appeal evidence upload", id, err);
    return fail("We couldn't save that file. Try again.", 500);
  }
}
