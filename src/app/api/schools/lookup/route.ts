import { NextResponse } from "next/server";
import { lookupForLogin, refreshSchoolFacts } from "@/lib/schools/service";
import { db, env, waitUntil } from "@/lib/server";

/** School autofill for the login screen. Read-mostly; only directory schools get provisioned. */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") ?? "";
  const result = await lookupForLogin(db(), email);
  if (result.status === "supported" && result.logoPending) {
    waitUntil(refreshSchoolFacts(env(), db(), result.school.id));
  }
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
