import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Returns E.164 (e.g. +12055550123) or null. Bare 10-digit numbers are treated as US. */
export function toE164(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), "US");
  return parsed?.isValid() ? parsed.number : null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  return parsePhoneNumberFromString(e164)?.formatNational() ?? e164;
}

export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}
