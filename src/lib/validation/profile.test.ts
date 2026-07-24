import { describe, it, expect } from "vitest";
import { validateDisplayName } from "./profile";

describe("validateDisplayName", () => {
  it("allows an empty value (field is optional)", () => {
    expect(validateDisplayName("").valid).toBe(true);
    expect(validateDisplayName("   ").valid).toBe(true);
  });

  it("accepts a normal name", () => {
    expect(validateDisplayName("Ada Lovelace").valid).toBe(true);
  });

  it("accepts letters from other scripts and safe punctuation", () => {
    expect(validateDisplayName("José O'Brien-Núñez").valid).toBe(true);
    expect(validateDisplayName("中文名").valid).toBe(true);
  });

  it("rejects a name that is too short", () => {
    const r = validateDisplayName("a");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/at least 2/);
  });

  it("rejects a name that is too long", () => {
    const r = validateDisplayName("a".repeat(41));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/40 characters or fewer/);
  });

  it("rejects disallowed characters", () => {
    const r = validateDisplayName("bad<name>");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/can only contain/);
  });
});
