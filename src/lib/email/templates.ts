// Small, hand-written email templates. Inline styles only; most clients ignore <style>.

import type { Email } from "./send";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(opts: { preheader: string; body: string; cta?: { label: string; url: string } }) {
  const button = opts.cta
    ? `<tr><td style="padding:8px 0 24px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#0B0B0F;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px;font-size:15px">${esc(opts.cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0B0B0F">
<span style="display:none;opacity:0;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:20px;padding:32px">
<tr><td style="font-size:22px;font-weight:800;letter-spacing:-0.5px;padding-bottom:24px">dibs</td></tr>
${opts.body}
${button}
<tr><td style="font-size:12px;color:#8A8A94;border-top:1px solid #EEE;padding-top:16px">You're getting this because you have an account at dibs.school.</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (text: string) => `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:16px">${text}</td></tr>`;

export function magicLinkEmail(opts: { to: string; url: string; code: string; schoolName: string }): Email {
  const codeBlock = `<tr><td style="padding:4px 0 20px"><div style="font-family:ui-monospace,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:8px;background:#F4F4F1;border-radius:12px;padding:14px 18px;display:inline-block">${opts.code}</div></td></tr>`;
  return {
    to: opts.to,
    subject: `Your sign-in link (code ${opts.code})`,
    html: layout({
      preheader: `Your code is ${opts.code}. The link expires in 15 minutes.`,
      body:
        p(`Tap the button to sign in with your ${esc(opts.schoolName)} email.`) +
        `<tr><td style="padding:8px 0 24px"><a href="${esc(opts.url)}" style="display:inline-block;background:#0B0B0F;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px;font-size:15px">Sign in</a></td></tr>` +
        p("Or type this code on the sign-in screen:") +
        codeBlock +
        p(`<span style="color:#6B6B76;font-size:13px">Expires in 15 minutes. If you didn't ask for this, you can ignore it.</span>`),
    }),
    text: `Sign in: ${opts.url}\n\nOr enter this code: ${opts.code}\n\nExpires in 15 minutes. If you didn't ask for this, ignore this email.`,
  };
}

export function noticeEmail(opts: {
  to: string;
  subject: string;
  lines: string[];
  cta?: { label: string; url: string };
}): Email {
  return {
    to: opts.to,
    subject: opts.subject,
    html: layout({ preheader: opts.lines[0] ?? opts.subject, body: opts.lines.map((l) => p(esc(l))).join(""), cta: opts.cta }),
    text: [...opts.lines, opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : ""].filter(Boolean).join("\n\n"),
  };
}

export function receiptEmail(opts: {
  to: string;
  subject: string;
  intro: string;
  rows: [label: string, value: string][];
  total: { label: string; value: string };
  footnote?: string;
  links?: { label: string; url: string }[];
  cta?: { label: string; url: string };
}): Email {
  const cell = "font-size:14px;padding:8px 0;border-bottom:1px solid #EEE";
  const table =
    `<tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
    opts.rows
      .map(([k, v]) => `<tr><td style="${cell};color:#6B6B76">${esc(k)}</td><td align="right" style="${cell};font-weight:600">${esc(v)}</td></tr>`)
      .join("") +
    `<tr><td style="font-size:16px;padding:12px 0 0;font-weight:700">${esc(opts.total.label)}</td><td align="right" style="font-size:16px;padding:12px 0 0;font-weight:800">${esc(opts.total.value)}</td></tr>` +
    `</table></td></tr>`;
  const links = opts.links?.length
    ? `<tr><td style="padding:0 0 20px">${opts.links
        .map(
          (l) =>
            `<a href="${esc(l.url)}" style="display:inline-block;margin:0 8px 8px 0;background:#F4F4F1;color:#0B0B0F;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px;font-size:14px">${esc(l.label)}</a>`,
        )
        .join("")}</td></tr>`
    : "";
  const foot = opts.footnote ? p(`<span style="color:#6B6B76;font-size:13px">${esc(opts.footnote)}</span>`) : "";
  return {
    to: opts.to,
    subject: opts.subject,
    html: layout({ preheader: opts.intro, body: p(esc(opts.intro)) + table + links + foot, cta: opts.cta }),
    text: [
      opts.intro,
      ...opts.rows.map(([k, v]) => `${k}: ${v}`),
      `${opts.total.label}: ${opts.total.value}`,
      ...(opts.links ?? []).map((l) => `${l.label}: ${l.url}`),
      opts.footnote ?? "",
      opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
