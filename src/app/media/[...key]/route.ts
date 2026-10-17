import { env } from "@/lib/server";

// Public media (listing photo derivatives, school logos). Keys are random and never reused,
// so responses are immutable and cached at the edge with the Cache API.
const PUBLIC_PREFIXES = ["schools/", "listings/", "avatars/"];

export async function GET(request: Request, { params }: RouteContext<"/media/[...key]">) {
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join("/");
  if (!PUBLIC_PREFIXES.some((p) => key.startsWith(p)) || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheKey = new Request(new URL(request.url).toString());
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  const object = await env().MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  const response = new Response(object.body, { headers });
  if (cache) {
    try {
      await cache.put(cacheKey, response.clone());
    } catch {
      /* the Cache API is unavailable in some local setups */
    }
  }
  return response;
}
