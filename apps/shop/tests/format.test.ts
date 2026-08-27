import { describe, expect, it } from "vitest";
import { formatDistance, formatKES } from "../lib/format";

describe("formatKES", () => {
  it("groups thousands", () => {
    expect(formatKES(1250)).toBe("KES 1,250");
    expect(formatKES(1250000)).toBe("KES 1,250,000");
  });

  it("does not group below a thousand", () => {
    expect(formatKES(999)).toBe("KES 999");
    expect(formatKES(0)).toBe("KES 0");
  });

  it("rounds rather than truncating", () => {
    expect(formatKES(1250.6)).toBe("KES 1,251");
    expect(formatKES(1250.4)).toBe("KES 1,250");
  });

  it("handles negatives without misplacing the sign", () => {
    // Refund lines. "KES -50" would be wrong; the sign belongs first.
    expect(formatKES(-50)).toBe("-KES 50");
  });

  it("does not render NaN to a customer", () => {
    // A missing price should look obviously absent, not like a real figure.
    expect(formatKES(Number.NaN)).toBe("KES —");
    expect(formatKES(Number.POSITIVE_INFINITY)).toBe("KES —");
  });
});

describe("formatDistance", () => {
  it("uses metres below a kilometre", () => {
    expect(formatDistance(250)).toBe("250 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("uses one decimal kilometre above that", () => {
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(4560)).toBe("4.6 km");
  });

  it("returns null when there is no distance", () => {
    // Callers render nothing rather than "0 m", which would claim the shop is
    // at the customer's doorstep.
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
  });
});
