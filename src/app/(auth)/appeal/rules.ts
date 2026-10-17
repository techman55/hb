// Shared by the appeal form, its server action and the evidence upload route.

export const REASON_MAX = 600;
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
export const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const EVIDENCE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
