// Listing generation with OpenAI (Responses API + strict JSON schema + photo input).
// The prompt aims for something a student would actually write: short, plain, specific.

import { CATEGORY_SLUGS, CATEGORIES } from "@/lib/categories";
import { CONDITIONS } from "@/db/schema";
import { requireSecret, type Env } from "@/lib/env";

export type GeneratedListing = {
  title: string;
  description: string;
  category: string;
  condition: (typeof CONDITIONS)[number];
  tags: string[];
  included: string[];
  suggested_price_per_day_cents: number;
  price_note: string;
  concerns: string[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "category", "condition", "tags", "included", "suggested_price_per_day_cents", "price_note", "concerns"],
  properties: {
    title: { type: "string", description: "Up to 60 characters. Brand + model + key detail. No marketing words." },
    description: { type: "string", description: "2 to 4 short sentences, under 400 characters." },
    category: { type: "string", enum: CATEGORY_SLUGS },
    condition: { type: "string", enum: [...CONDITIONS] },
    tags: { type: "array", items: { type: "string" }, description: "3 to 6 short tags in Title Case" },
    included: { type: "array", items: { type: "string" }, description: "Accessories or extras visible or mentioned. Up to 5." },
    suggested_price_per_day_cents: { type: "integer", description: "Suggested daily rental price in cents" },
    price_note: { type: "string", description: "One short clause explaining the price, under 100 characters" },
    concerns: {
      type: "array",
      items: { type: "string", enum: ["weapon", "alcohol", "drugs", "tobacco_vape", "adult", "hazardous", "stolen_or_id", "counterfeit", "not_an_item", "photo_mismatch"] },
      description: "Policy problems, if any. Usually empty.",
    },
  },
} as const;

const SYSTEM = `You write rental listings for Dibs, a site where college students rent things to each other for a day or a week (a graphing calculator before an exam, lab goggles, a cap and gown).

Write the listing like a real student posting to classmates:
- Plain, specific, and short. Lead with what it is and its condition. Mention what's included.
- No hype or filler: never use words like "perfect", "must-have", "elevate", "ultimate", "seamless", "game-changer", "look no further", "don't miss".
- No emoji, no exclamation marks, no em dashes, no hashtags. Sentence case. Contractions are fine.
- Only state facts you can see in the photos or that the owner told you. If the model number or edition isn't clear, describe it generally instead of guessing.
- Don't mention price, payment, meetups, or the owner's personal details in the description.
- Title: brand + model + one useful detail, max 60 characters. Example: "TI-84 Plus CE graphing calculator".
- Description: 2 to 4 short sentences, under 400 characters total.
- Tags: 3 to 6 short Title Case tags people would search for (e.g. "Calculator", "Graphing", "Math", "Engineering").
- Category must be one of: ${CATEGORIES.map((c) => `${c.slug} (${c.name})`).join(", ")}.

Pricing: suggest a fair daily rental price for students, roughly 3 to 8 percent of the item's used resale value per day, rounded to the nearest 50 cents, minimum $1. Explain it in a few words in price_note (e.g. "Used ones sell for about $90").

Flag concerns only for real policy problems: weapons, alcohol, drugs, tobacco or vapes, adult items, hazardous materials, IDs or likely stolen goods, counterfeits, photos that don't show a physical item, or photos that clearly don't match the owner's description.

Example of the tone:
Title: TI-84 Plus CE graphing calculator
Description: Rose gold TI-84 Plus CE in good shape, screen has no scratches. Comes with the charging cable and slide-on cover. Approved for the SAT, ACT and most engineering exams.`;

export type GenerateInput = {
  brief: string;
  schoolName: string;
  images: string[]; // data: URLs
  previous?: Partial<GeneratedListing>;
  feedback?: string;
};

function userPrompt(input: GenerateInput): string {
  const lines = [`School: ${input.schoolName}`, `Owner's note (private, in their words): ${input.brief || "(none)"}`];
  if (input.previous) {
    lines.push(
      "",
      "Here is the current draft, including any edits the owner made by hand. Keep their edits unless the feedback says otherwise:",
      JSON.stringify(
        {
          title: input.previous.title,
          description: input.previous.description,
          category: input.previous.category,
          condition: input.previous.condition,
          tags: input.previous.tags,
          included: input.previous.included,
        },
        null,
        2,
      ),
    );
  }
  if (input.feedback) lines.push("", `What the owner says went wrong: ${input.feedback}`, "Fix that and return the full listing.");
  lines.push("", `There ${input.images.length === 1 ? "is 1 photo" : `are ${input.images.length} photos`} of the item attached.`);
  return lines.join("\n");
}

function clean(out: GeneratedListing): GeneratedListing {
  const tidy = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/!+/g, ".").replace(/\s+/g, " ").trim();
  const tags = [...new Set(out.tags.map((t) => tidy(t).replace(/^#/, "")).filter(Boolean))].slice(0, 6);
  const cents = Math.max(100, Math.round((out.suggested_price_per_day_cents || 100) / 50) * 50);
  return {
    ...out,
    title: tidy(out.title).slice(0, 60),
    description: tidy(out.description).slice(0, 500),
    category: (CATEGORY_SLUGS as readonly string[]).includes(out.category) ? out.category : "other",
    tags,
    included: out.included.map(tidy).filter(Boolean).slice(0, 5),
    suggested_price_per_day_cents: Math.min(cents, 10_000),
    price_note: tidy(out.price_note).slice(0, 100),
  };
}

export async function generateListing(env: Env, input: GenerateInput): Promise<GeneratedListing> {
  const key = requireSecret(env, "OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-6.1-sol",
      instructions: SYSTEM,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt(input) },
            ...input.images.slice(0, 4).map((url) => ({ type: "input_image", image_url: url, detail: "low" })),
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "listing", strict: true, schema: SCHEMA } },
      store: false,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    output_text?: string;
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  };
  const text =
    body.output_text ??
    body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  if (!text) {
    const refusal = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "refusal")?.refusal;
    throw new Error(refusal ? `refused: ${refusal}` : "OpenAI returned no listing");
  }
  return clean(JSON.parse(text) as GeneratedListing);
}

/** Text moderation for owner-written listings (fail-open: a moderation outage shouldn't block posting). */
export async function moderateText(env: Env, text: string): Promise<{ flagged: boolean; categories: string[] }> {
  if (!env.OPENAI_API_KEY || !text.trim()) return { flagged: false, categories: [] };
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, 4000) }),
    });
    if (!res.ok) return { flagged: false, categories: [] };
    const body = (await res.json()) as { results?: { flagged: boolean; categories: Record<string, boolean> }[] };
    const r = body.results?.[0];
    return { flagged: !!r?.flagged, categories: Object.entries(r?.categories ?? {}).filter(([, v]) => v).map(([k]) => k) };
  } catch {
    return { flagged: false, categories: [] };
  }
}
