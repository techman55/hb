// Pure helpers for email and domain handling. Unit-tested in domains.test.ts.

const EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain) ? domain : null;
}

/**
 * Every domain we should try, most specific first, never shorter than two labels:
 * `cs.crimson.ua.edu` → [`cs.crimson.ua.edu`, `crimson.ua.edu`, `ua.edu`].
 */
export function domainCandidates(domain: string): string[] {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join("."));
  return out;
}

export function isEduDomain(domain: string): boolean {
  return domain.toLowerCase().endsWith(".edu");
}

/** The registrable part of an .edu domain: `crimson.ua.edu` → `ua.edu`. */
export function baseEduDomain(domain: string): string {
  const labels = domain.toLowerCase().split(".");
  return labels.slice(-2).join(".");
}

const SMALL_WORDS = new Set(["of", "the", "and", "at", "in", "for", "&", "-", "de"]);

/** "The University of Alabama" → "UA"; "Georgia Institute of Technology" → "GIT". */
export function acronym(name: string): string {
  const letters = name
    .replace(/[^A-Za-z&\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase());
  return letters.join("").slice(0, 4) || name.slice(0, 2).toUpperCase();
}

/** Readable fallback name when a .edu isn't in the directory: `mines.edu` → "Mines". */
export function nameFromDomain(domain: string): string {
  const label = baseEduDomain(domain).split(".")[0];
  return label.length <= 4 ? label.toUpperCase() : label[0].toUpperCase() + label.slice(1);
}

export function slugFromDomain(domain: string): string {
  return baseEduDomain(domain).split(".")[0].replace(/[^a-z0-9-]/g, "");
}
