import { describe, expect, it } from "vitest";
import { acronym, baseEduDomain, domainCandidates, emailDomain, isEduDomain, isValidEmail, nameFromDomain, slugFromDomain } from "./domains";

describe("emailDomain", () => {
  it("extracts and lowercases the domain", () => {
    expect(emailDomain("Alex@Crimson.UA.edu")).toBe("crimson.ua.edu");
  });
  it("rejects malformed input", () => {
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(emailDomain("a@b")).toBeNull();
    expect(emailDomain("a@exa mple.edu")).toBeNull();
  });
  it("uses the last @ so quoted locals can't spoof the domain", () => {
    expect(emailDomain('"x@ua.edu"@gmail.com')).toBe("gmail.com");
  });
});

describe("domainCandidates", () => {
  it("walks from most to least specific, stopping at two labels", () => {
    expect(domainCandidates("cs.crimson.ua.edu")).toEqual(["cs.crimson.ua.edu", "crimson.ua.edu", "ua.edu"]);
    expect(domainCandidates("ua.edu")).toEqual(["ua.edu"]);
  });
  it("never yields a bare TLD", () => {
    expect(domainCandidates("edu")).toEqual([]);
  });
});

describe("edu helpers", () => {
  it("detects .edu", () => {
    expect(isEduDomain("crimson.ua.edu")).toBe(true);
    expect(isEduDomain("edu.example.com")).toBe(false);
    expect(isEduDomain("ua.edu.ph")).toBe(false);
  });
  it("finds the registrable .edu domain", () => {
    expect(baseEduDomain("crimson.ua.edu")).toBe("ua.edu");
    expect(slugFromDomain("crimson.ua.edu")).toBe("ua");
  });
  it("makes readable fallbacks", () => {
    expect(acronym("The University of Alabama")).toBe("UA");
    expect(acronym("Georgia Institute of Technology")).toBe("GIT");
    expect(nameFromDomain("mines.edu")).toBe("Mines");
    expect(nameFromDomain("mit.edu")).toBe("MIT");
  });
  it("validates emails", () => {
    expect(isValidEmail("a@ua.edu")).toBe(true);
    expect(isValidEmail("a@@ua.edu")).toBe(false);
  });
});
