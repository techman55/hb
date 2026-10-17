import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { schoolDirectory, schools } from "@/db/schema";
import { db } from "@/lib/server";

type Suggestion = { id: string | null; name: string; detail: string | null };

const LIMIT = 8;

/** School suggestions for the access-appeal form: campuses already on Dibs first, then the directory. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const contains = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const d = db();
  const [known, directory] = await Promise.all([
    d
      .select({ id: schools.id, name: schools.name, domain: schools.primaryDomain })
      .from(schools)
      .where(sql`${schools.enabled} = 1 AND ${schools.name} LIKE ${contains} ESCAPE '\\'`)
      .orderBy(sql`${schools.name} LIKE ${prefix} ESCAPE '\\' DESC`, sql`length(${schools.name})`)
      .limit(LIMIT),
    d
      .select({
        name: schoolDirectory.name,
        domain: schoolDirectory.domain,
        state: schoolDirectory.state,
        country: schoolDirectory.country,
      })
      .from(schoolDirectory)
      .where(sql`${schoolDirectory.name} LIKE ${contains} ESCAPE '\\'`)
      .orderBy(sql`${schoolDirectory.name} LIKE ${prefix} ESCAPE '\\' DESC`, sql`length(${schoolDirectory.name})`)
      .limit(LIMIT * 2),
  ]);

  const seenNames = new Set(known.map((s) => s.name.toLowerCase()));
  const seenDomains = new Set(known.map((s) => s.domain));
  const results: Suggestion[] = known.map((s) => ({ id: s.id, name: s.name, detail: "On Dibs" }));
  for (const row of directory) {
    if (results.length >= LIMIT) break;
    if (seenNames.has(row.name.toLowerCase()) || seenDomains.has(row.domain)) continue;
    seenNames.add(row.name.toLowerCase());
    results.push({ id: null, name: row.name, detail: [row.state, row.country].filter(Boolean).join(", ") || row.domain });
  }

  return NextResponse.json({ results: results.slice(0, LIMIT) }, { headers: { "cache-control": "private, max-age=60" } });
}
