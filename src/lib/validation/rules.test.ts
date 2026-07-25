import { describe, it, expect } from "vitest";
import { required, minLength, maxLength, pattern, combine, VALID } from "./rules";

describe("validation rules", () => {
  describe("required", () => {
    it("passes for non-empty values", () => {
      expect(required("hi").valid).toBe(true);
    });
    it("fails for empty / whitespace-only values", () => {
      expect(required("").valid).toBe(false);
      expect(required("   ").valid).toBe(false);
    });
    it("uses the provided label in the error", () => {
      expect(required("", "Name").error).toBe("Name is required.");
    });
  });

  describe("minLength", () => {
    it("passes at the boundary", () => {
      expect(minLength("ab", 2).valid).toBe(true);
    });
    it("fails below the boundary", () => {
      expect(minLength("a", 2).valid).toBe(false);
    });
  });

  describe("maxLength", () => {
    it("passes at the boundary", () => {
      expect(maxLength("ab", 2).valid).toBe(true);
    });
    it("fails above the boundary", () => {
      expect(maxLength("abc", 2).valid).toBe(false);
    });
  });

  describe("pattern", () => {
    it("passes when the regex matches", () => {
      expect(pattern("abc", /^[a-z]+$/, "letters only").valid).toBe(true);
    });
    it("fails and returns the custom error when it does not match", () => {
      expect(pattern("ab1", /^[a-z]+$/, "letters only")).toEqual({
        valid: false,
        error: "letters only",
      });
    });
  });

  describe("combine", () => {
    it("returns VALID when all rules pass", () => {
      expect(combine(VALID, VALID)).toBe(VALID);
    });
    it("returns the first failing rule", () => {
      const result = combine(VALID, { valid: false, error: "first" }, { valid: false, error: "second" });
      expect(result.error).toBe("first");
    });
  });
});
