// Sightengine `genai` model: a pixel-level classifier for AI-generated and AI-edited images.
// https://sightengine.com/docs/ai-generated-image-detection
// Calls are metered against the free plan by quota.ts before we ever hit the network.

import type { Env } from "@/lib/env";

export type SightengineResult =
  | { status: "skipped"; note: string }
  | { status: "retry"; note: string }
  | { status: "error"; note: string }
  | { status: "ok"; score: number; topGenerators: { name: string; score: number }[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function sightengineConfigured(env: Env) {
  return Boolean(env.SIGHTENGINE_API_USER && env.SIGHTENGINE_API_SECRET);
}

export async function checkSightengine(env: Env, image: Blob): Promise<SightengineResult> {
  if (!sightengineConfigured(env)) return { status: "skipped", note: "Sightengine keys not set" };

  // The free plan allows 1 request/second; back off and retry a couple of times on 429.
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.append("media", image, "photo.jpg");
    form.append("models", "genai");
    form.append("api_user", env.SIGHTENGINE_API_USER);
    form.append("api_secret", env.SIGHTENGINE_API_SECRET);
    let res: Response;
    try {
      res = await fetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: form });
    } catch (err) {
      return { status: "retry", note: `network: ${String(err).slice(0, 120)}` };
    }
    if (res.status === 429) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      error?: { type?: string; message?: string };
      type?: { ai_generated?: number; ai_generators?: Record<string, number> };
    } | null;
    if (!res.ok || body?.status !== "success") {
      const type = body?.error?.type ?? "";
      if (/limit|usage/i.test(type) || res.status >= 500) return { status: "retry", note: body?.error?.message ?? `Sightengine ${res.status}` };
      return { status: "error", note: body?.error?.message ?? `Sightengine ${res.status}` };
    }
    const generators = Object.entries(body.type?.ai_generators ?? {})
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return { status: "ok", score: body.type?.ai_generated ?? 0, topGenerators: generators };
  }
  return { status: "retry", note: "Sightengine rate limit" };
}
