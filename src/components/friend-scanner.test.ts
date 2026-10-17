import { describe, expect, it } from "vitest";
import { friendCodeFrom } from "./friend-scanner";

describe("friendCodeFrom", () => {
  it("reads codes from Dibs links", () => {
    expect(friendCodeFrom("https://dibs.school/f/abc123XY", "localhost:3000")).toBe("abc123XY");
    expect(friendCodeFrom("http://localhost:3000/f/abc123XY/", "localhost:3000")).toBe("abc123XY");
  });
  it("ignores other sites and paths", () => {
    expect(friendCodeFrom("https://evil.example/f/abc123XY", "dibs.school")).toBeNull();
    expect(friendCodeFrom("https://dibs.school/listing/abc123XY", "dibs.school")).toBeNull();
    expect(friendCodeFrom("DIBS1:rnt_1:pickup:1:sig", "dibs.school")).toBeNull();
  });
});
