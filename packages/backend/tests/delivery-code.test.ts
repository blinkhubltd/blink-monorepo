import { describe, expect, it } from "vitest";
import {
  __testing,
  generateDeliveryCode,
} from "../convex/lib/delivery_code";

const { isWeakCode, isAllSameDigit } = __testing;

/**
 * These exist because the all-identical-digits check was silently broken while
 * moving this file out of `hooks/`: an escaping mistake dropped the backreference
 * from `/^(\d)\1{5}$/`, leaving `/^(\d){5}$/`, which matches nothing for a
 * six-digit code. The rule was disabled and nothing failed.
 */

describe("isAllSameDigit", () => {
  it("catches every all-identical code in range", () => {
    for (const d of "123456789") {
      expect(isAllSameDigit(d.repeat(6)), `${d.repeat(6)}`).toBe(true);
    }
  });

  it("does not flag codes with any variation", () => {
    expect(isAllSameDigit("111112")).toBe(false);
    expect(isAllSameDigit("211111")).toBe(false);
    expect(isAllSameDigit("123456")).toBe(false);
  });
});

describe("isWeakCode", () => {
  it("rejects repdigits and the known sequences", () => {
    for (const c of ["111111", "999999", "123456", "654321", "000000"]) {
      expect(isWeakCode(c), c).toBe(true);
    }
  });

  it("accepts ordinary codes", () => {
    for (const c of ["100000", "483920", "999998", "123457"]) {
      expect(isWeakCode(c), c).toBe(false);
    }
  });
});

describe("generateDeliveryCode", () => {
  it("always returns six digits", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateDeliveryCode()).toMatch(/^[0-9]{6}$/);
    }
  });

  it("stays within the intended range", () => {
    for (let i = 0; i < 500; i++) {
      const n = Number(generateDeliveryCode());
      expect(n).toBeGreaterThanOrEqual(100_000);
      expect(n).toBeLessThanOrEqual(999_999);
    }
  });

  it("never emits a weak code", () => {
    for (let i = 0; i < 2_000; i++) {
      const c = generateDeliveryCode();
      expect(isWeakCode(c), c).toBe(false);
    }
  });

  it("is not constant", () => {
    // Cheap sanity check that the generator is actually random — a stuck
    // implementation would make every delivery share one code.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateDeliveryCode());
    expect(seen.size).toBeGreaterThan(150);
  });
});
