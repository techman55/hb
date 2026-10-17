// Finds a school's logo online and stores it in R2. Order of preference:
// 1. Wikidata (logo P154, else seal P158), matched on the official website P856
// 2. The homepage's apple-touch-icon / icon link
// 3. DuckDuckGo's favicon cache
// When nothing works the UI falls back to a monogram, so failures are not fatal.

import type { Env } from "@/lib/env";

const UA = "DibsBot/1.0 (+https://dibs.school; support@dibs.school)";
const MAX_LOGO_BYTES = 1_000_000;

export type SchoolFacts = {
  logo?: { bytes: ArrayBuffer; contentType: string; source: string };
  lat?: number;
  lng?: number;
  accent?: string;
};

/** Common Wikidata "official color" labels mapped to hex. Neutrals are ignored on purpose. */
const COLOR_NAMES: Record<string, string> = {
  crimson: "#9E1B32",
  cardinal: "#8C1515",
  "cardinal red": "#8C1515",
  maroon: "#7A0019",
  garnet: "#73000A",
  scarlet: "#BB0000",
  red: "#C8102E",
  "burnt orange": "#BF5700",
  orange: "#F56600",
  gold: "#B3A369",
  "old gold": "#B3A369",
  yellow: "#FFC72C",
  green: "#154734",
  "kelly green": "#00843D",
  "forest green": "#154734",
  teal: "#00778B",
  blue: "#0033A0",
  "royal blue": "#0033A0",
  "navy blue": "#002855",
  navy: "#002855",
  "carolina blue": "#4B9CD3",
  "columbia blue": "#9BCBEB",
  purple: "#4E2A84",
  violet: "#4E2A84",
};

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImage(url: string, source: string): Promise<SchoolFacts["logo"] | undefined> {
  try {
    const res = await fetchWithTimeout(url, {}, 5000);
    if (!res.ok) return undefined;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon)$/.test(contentType)) return undefined;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 200 || bytes.byteLength > MAX_LOGO_BYTES) return undefined;
    return { bytes, contentType, source };
  } catch {
    return undefined;
  }
}

function siteVariants(domain: string): string[] {
  const out: string[] = [];
  for (const scheme of ["https", "http"])
    for (const host of [domain, `www.${domain}`])
      for (const slash of ["", "/"]) out.push(`<${scheme}://${host}${slash}>`);
  return out;
}

async function fromWikidata(domain: string): Promise<Omit<SchoolFacts, "logo"> & { imageUrl?: string }> {
  const query = `
    SELECT ?item ?logo ?seal ?coord ?colorLabel WHERE {
      VALUES ?site { ${siteVariants(domain).join(" ")} }
      ?item wdt:P856 ?site .
      OPTIONAL { ?item wdt:P154 ?logo }
      OPTIONAL { ?item wdt:P158 ?seal }
      OPTIONAL { ?item wdt:P625 ?coord }
      OPTIONAL { ?item wdt:P6364 ?color . ?color rdfs:label ?colorLabel FILTER(lang(?colorLabel) = "en") }
    } LIMIT 10`;
  try {
    const res = await fetchWithTimeout(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
      { headers: { accept: "application/sparql-results+json" } },
      6000,
    );
    if (!res.ok) return {};
    const json = (await res.json()) as {
      results: { bindings: Record<string, { value: string } | undefined>[] };
    };
    const rows = json.results.bindings;
    if (!rows.length) return {};
    const pick = (k: string) => rows.find((r) => r[k])?.[k]?.value;
    const file = pick("logo") ?? pick("seal");
    const coord = pick("coord")?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    const accent = rows
      .map((r) => r.colorLabel?.value.toLowerCase())
      .map((c) => (c ? COLOR_NAMES[c] : undefined))
      .find(Boolean);
    return {
      // Special:FilePath with ?width renders SVGs to PNG, which keeps us out of the SVG business.
      imageUrl: file ? `${file.replace(/^http:/, "https:")}?width=256` : undefined,
      lng: coord ? Number(coord[1]) : undefined,
      lat: coord ? Number(coord[2]) : undefined,
      accent,
    };
  } catch {
    return {};
  }
}

async function fromHomepage(domain: string): Promise<string | undefined> {
  try {
    const res = await fetchWithTimeout(`https://www.${domain}/`, { redirect: "follow" }, 5000);
    if (!res.ok) return undefined;
    const html = (await res.text()).slice(0, 300_000);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    const score = (tag: string) => {
      if (/apple-touch-icon/i.test(tag)) return 3;
      const size = Number(tag.match(/sizes=["']?(\d+)/i)?.[1] ?? 0);
      if (/rel=["'][^"']*icon/i.test(tag)) return size >= 96 ? 2 : 1;
      return 0;
    };
    const best = links.filter((t) => score(t) > 0 && !/\.svg/i.test(t)).sort((a, b) => score(b) - score(a))[0];
    const href = best?.match(/href=["']([^"']+)["']/i)?.[1];
    return href ? new URL(href, res.url).toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function discoverSchoolFacts(domain: string): Promise<SchoolFacts> {
  const wiki = await fromWikidata(domain);
  let logo = wiki.imageUrl ? await downloadImage(wiki.imageUrl, "wikidata") : undefined;
  if (!logo) {
    const icon = await fromHomepage(domain);
    if (icon) logo = await downloadImage(icon, "homepage");
  }
  if (!logo) logo = await downloadImage(`https://icons.duckduckgo.com/ip3/${domain}.ico`, "favicon");
  return { logo, lat: wiki.lat, lng: wiki.lng, accent: wiki.accent };
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

export async function storeLogo(env: Env, slug: string, logo: NonNullable<SchoolFacts["logo"]>): Promise<string> {
  const key = `schools/${slug}/logo-${Date.now().toString(36)}.${EXT[logo.contentType] ?? "img"}`;
  await env.MEDIA.put(key, logo.bytes, {
    httpMetadata: { contentType: logo.contentType, cacheControl: "public, max-age=31536000, immutable" },
  });
  return key;
}
