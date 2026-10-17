import { describe, expect, it } from "vitest";
import { addDays, diffDays, rangesOverlap, relativeDay, todayISO } from "./dates";
import { ftsQuery } from "./listings/queries";

describe("dates", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(diffDays("2026-10-17", "2026-10-20")).toBe(3);
  });
  it("evaluates today in the campus timezone", () => {
    // 03:00 UTC on Oct 18 is still the evening of Oct 17 in Tuscaloosa.
    expect(todayISO("America/Chicago", new Date(Date.UTC(2026, 9, 18, 3)))).toBe("2026-10-17");
  });
  it("describes relative days", () => {
    expect(relativeDay("2026-10-17", "2026-10-17")).toBe("today");
    expect(relativeDay("2026-10-18", "2026-10-17")).toBe("tomorrow");
    expect(relativeDay("2026-10-20", "2026-10-17")).toBe("in 3 days");
  });
  it("treats rentals as [start, start + days) so back-to-back bookings don't collide", () => {
    expect(rangesOverlap("2026-10-17", 3, "2026-10-20", 2)).toBe(false);
    expect(rangesOverlap("2026-10-17", 3, "2026-10-19", 2)).toBe(true);
  });
});

describe("ftsQuery", () => {
  it("builds a prefix query and strips FTS syntax", () => {
    expect(ftsQuery("TI-84 calc")).toBe('"ti"* "84"* "calc"*');
    expect(ftsQuery('a" OR 1=1 --')).toBe('"a"* "or"* "1"* "1"*');
    expect(ftsQuery("   ")).toBeNull();
  });
});
