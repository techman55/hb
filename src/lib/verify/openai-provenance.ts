// OpenAI Content Provenance API: checks an image for OpenAI's SynthID watermark and C2PA manifest.
// https://developers.openai.com/api/docs/guides/content-provenance
// It only recognises OpenAI output; a `not_detected` result says nothing about other generators.

import type { Env } from "@/lib/env";

export type ProvenanceResult =
  | { status: "skipped" | "unavailable"; note: string }
  | { status: "retry"; note: string }
  | { status: "error"; note: string }
  | {
      status: "ok";
      synthid: "detected" | "not_detected" | "n/a";
      c2pa: "detected" | "not_detected" | "n/a";
      c2paState?: string;
      model?: string | null;
      raw: unknown;
    };

type Entry = { type: string; outcome?: string; validation_state?: string; model?: string | null };

export async function checkOpenAIProvenance(env: Env, image: Blob): Promise<ProvenanceResult> {
  if (!env.OPENAI_API_KEY) return { status: "skipped", note: "OPENAI_API_KEY not set" };
  const form = new FormData();
  form.append("file", image, image.type === "image/png" ? "photo.png" : image.type === "image/webp" ? "photo.webp" : "photo.jpg");
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/content_provenance_checks", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });
  } catch (err) {
    return { status: "retry", note: `network: ${String(err).slice(0, 120)}` };
  }
  if (res.status === 404 || res.status === 403) {
    return { status: "unavailable", note: "This OpenAI organization doesn't have Content Provenance access yet" };
  }
  if (res.status === 429 || res.status >= 500) return { status: "retry", note: `OpenAI ${res.status}` };
  if (!res.ok) return { status: "error", note: `OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}` };

  const body = (await res.json()) as { results?: Entry[] };
  const results = body.results ?? [];
  const synth = results.find((r) => r.type === "synthid");
  const c2pa = results.find((r) => r.type === "c2pa");
  return {
    status: "ok",
    synthid: synth ? (synth.outcome === "detected" ? "detected" : "not_detected") : "n/a",
    c2pa: c2pa ? (c2pa.outcome === "detected" ? "detected" : "not_detected") : "n/a",
    c2paState: c2pa?.validation_state,
    model: synth?.model ?? c2pa?.model ?? null,
    raw: body,
  };
}
