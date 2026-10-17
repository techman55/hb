import type { Env } from "@/lib/env";
import { isDev } from "@/lib/env";

export type Email = { to: string; subject: string; html: string; text: string; replyTo?: string };

/** Sends through Cloudflare Email Service (`EMAIL` binding). In local dev, the email is printed to the console instead. */
export async function sendEmail(env: Env, email: Email): Promise<void> {
  if (isDev(env)) {
    console.log(`\n📧  Email to ${email.to}\n    ${email.subject}\n\n${email.text}\n`);
    return;
  }
  if (!env.EMAIL) throw new Error("Missing EMAIL send_email binding. See docs/ENVIRONMENT.md.");
  await env.EMAIL.send({
    from: parseAddress(env.EMAIL_FROM || "Dibs <login@dibs.school>"),
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: email.replyTo,
  });
}

/** "Dibs <login@dibs.school>" → { name, email }; a bare address is passed through. */
function parseAddress(value: string): string | EmailAddress {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1].replace(/^"|"$/g, ""), email: match[2] } : value.trim();
}
