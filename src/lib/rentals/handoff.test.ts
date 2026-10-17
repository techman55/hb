import { describe, expect, it } from "vitest";
import { randomToken } from "@/lib/crypto";
import { numericCode, qrPayload, STEP_SECONDS, verifyHandoff } from "./handoff";

const authSecret = "test-auth-secret-0123456789";
const handoffSecret = randomToken(20);
const base = { rentalId: "rnt_abc", handoffSecret, authSecret };
const now = Date.UTC(2026, 9, 17, 16, 0, 0);

describe("QR payload", () => {
  it("verifies for the right rental and action before it expires", async () => {
    const qr = await qrPayload(authSecret, "rnt_abc", "pickup", now);
    expect(await verifyHandoff({ ...base, input: qr, action: "pickup", now: now + 60_000 })).toBe(true);
  });
  it("rejects after expiry", async () => {
    const qr = await qrPayload(authSecret, "rnt_abc", "pickup", now);
    expect(await verifyHandoff({ ...base, input: qr, action: "pickup", now: now + 5 * 60_000 })).toBe(false);
  });
  it("can't be replayed for the other action or another rental", async () => {
    const qr = await qrPayload(authSecret, "rnt_abc", "pickup", now);
    expect(await verifyHandoff({ ...base, input: qr, action: "return", now })).toBe(false);
    expect(await verifyHandoff({ ...base, rentalId: "rnt_other", input: qr, action: "pickup", now })).toBe(false);
  });
  it("rejects a forged signature", async () => {
    const qr = await qrPayload(authSecret, "rnt_abc", "pickup", now);
    const forged = qr.replace(/:[^:]+$/, ":AAAAAAAAAAAAAAAAAAAAAA");
    expect(await verifyHandoff({ ...base, input: forged, action: "pickup", now })).toBe(false);
  });
});

describe("6-digit code", () => {
  it("accepts the current and adjacent 30-second windows", async () => {
    const code = await numericCode(handoffSecret, "pickup", now);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyHandoff({ ...base, input: code, action: "pickup", now })).toBe(true);
    expect(await verifyHandoff({ ...base, input: code, action: "pickup", now: now + STEP_SECONDS * 1000 })).toBe(true);
  });
  it("expires after a couple of windows", async () => {
    const code = await numericCode(handoffSecret, "pickup", now);
    expect(await verifyHandoff({ ...base, input: code, action: "pickup", now: now + 3 * STEP_SECONDS * 1000 })).toBe(false);
  });
  it("differs between pickup and return", async () => {
    const pickup = await numericCode(handoffSecret, "pickup", now);
    const ret = await numericCode(handoffSecret, "return", now);
    expect(pickup).not.toBe(ret);
    expect(await verifyHandoff({ ...base, input: pickup, action: "return", now })).toBe(false);
  });
  it("ignores spaces the renter might type", async () => {
    const code = await numericCode(handoffSecret, "return", now);
    expect(await verifyHandoff({ ...base, input: `${code.slice(0, 3)} ${code.slice(3)}`, action: "return", now })).toBe(true);
  });
});
