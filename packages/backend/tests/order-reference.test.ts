import { describe, expect, it } from "vitest";

import { generateOrderReference } from "../convex/lib/order_reference";

describe("generateOrderReference", () => {
  it("is exactly 10 digits", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOrderReference()).toMatch(/^\d{10}$/);
    }
  });

  it("never starts with 0", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOrderReference()[0]).not.toBe("0");
    }
  });

  it("is not the same value twice in a row across many calls", () => {
    // Not a rigorous uniqueness proof — there is none for randomness — just
    // a smoke check that this isn't secretly constant.
    const seen = new Set(Array.from({ length: 500 }, generateOrderReference));
    expect(seen.size).toBeGreaterThan(490);
  });
});
