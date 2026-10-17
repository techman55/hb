import type { Env } from "@/lib/env";
import { isDev } from "@/lib/env";

/** Sends an SMS through Twilio's REST API (the Node SDK doesn't run on Workers). */
export async function sendSms(env: Env, to: string, body: string): Promise<void> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    if (isDev(env)) {
      console.log(`\n📱  SMS to ${to}: ${body}\n`);
      return;
    }
    throw new Error("Twilio is not configured. See docs/ENVIRONMENT.md.");
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
}
