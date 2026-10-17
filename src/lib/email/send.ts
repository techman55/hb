import type { Env } from "@/lib/env";
import { isDev } from "@/lib/env";

export type Email = { to: string; subject: string; html: string; text: string; replyTo?: string };

/** Sends through Resend. Without a key in local dev, the email is printed to the console instead. */
export async function sendEmail(env: Env, email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (isDev(env)) {
      console.log(`\n📧  Email to ${email.to}\n    ${email.subject}\n\n${email.text}\n`);
      return;
    }
    throw new Error("Missing secret RESEND_API_KEY. See docs/ENVIRONMENT.md.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "Dibs <login@dibs.school>",
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
