import { describe, expect, it } from "vitest";

import {
  URGENT_DAYS,
  clearanceUnavailableReason,
  daysUntil,
  describeExpiry,
  describeSaving,
} from "../lib/clearance";

const NOW = Date.UTC(2026, 7, 31, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe("daysUntil", () => {
  it("counts whole days ahead", () => {
    expect(daysUntil(NOW + 3 * DAY, NOW)).toBe(3);
  });

  it("floors rather than rounding up", () => {
    // Rounding up would report an item expiring in ten minutes as having a day
    // left, which is the error that gets someone ill.
    expect(daysUntil(NOW + 1000, NOW)).toBe(0);
    expect(daysUntil(NOW + 3.9 * DAY, NOW)).toBe(3);
  });

  it("is negative once past", () => {
    expect(daysUntil(NOW - DAY, NOW)).toBe(-1);
    expect(daysUntil(NOW - 1000, NOW)).toBe(-1);
  });
});

describe("describeExpiry", () => {
  it("prefers the food date over the offer date", () => {
    // The distinction that matters: `expiry_date` is when the food goes off,
    // `display_end_date` is when the shop stops offering it. Showing the second
    // as the first tells someone their yoghurt is fine for a fortnight when it
    // turns tomorrow.
    const result = describeExpiry(NOW + DAY, NOW + 14 * DAY, NOW);
    expect(result.basis).toBe("expiry");
    expect(result.label).toBe("Use by tomorrow");
    expect(result.urgent).toBe(true);
  });

  it("says which date it is talking about when there is no food date", () => {
    const result = describeExpiry(undefined, NOW + 10 * DAY, NOW);
    expect(result.basis).toBe("offer");
    expect(result.label).toBe("Offer ends in 10 days");
    expect(result.urgent).toBe(false);
  });

  it("marks today and tomorrow urgent", () => {
    expect(describeExpiry(NOW + 1000, NOW + 5 * DAY, NOW).label).toBe(
      "Use today",
    );
    expect(describeExpiry(NOW + 1000, NOW + 5 * DAY, NOW).urgent).toBe(true);
  });

  it("marks anything past its date urgent, and says so", () => {
    const result = describeExpiry(NOW - DAY, NOW + 5 * DAY, NOW);
    expect(result.label).toBe("Past its date");
    expect(result.urgent).toBe(true);
  });

  it("uses the urgency threshold consistently", () => {
    expect(describeExpiry(NOW + URGENT_DAYS * DAY, NOW, NOW).urgent).toBe(true);
    expect(
      describeExpiry(NOW + (URGENT_DAYS + 1) * DAY, NOW, NOW).urgent,
    ).toBe(false);
  });

  it("ignores a non-finite expiry rather than rendering NaN days", () => {
    const result = describeExpiry(Number.NaN, NOW + 4 * DAY, NOW);
    expect(result.basis).toBe("offer");
    expect(result.label).not.toMatch(/NaN/);
  });
});

describe("describeSaving", () => {
  it("computes the saving from the two prices", () => {
    // Not from the stored `discount_percentage`: it is written independently and
    // can disagree with the prices shown beside it.
    expect(describeSaving(250, 100)).toEqual({ amount: 150, percent: 60 });
  });

  it("claims nothing when there is nothing to claim", () => {
    expect(describeSaving(100, 100)).toBeNull();
    expect(describeSaving(100, 120)).toBeNull();
  });

  it("returns null rather than Infinity or NaN", () => {
    expect(describeSaving(0, 0)).toBeNull();
    expect(describeSaving(Number.NaN, 10)).toBeNull();
    expect(describeSaving(100, Number.NaN)).toBeNull();
  });
});

describe("clearanceUnavailableReason", () => {
  const live = { status: "Active", quantity: 5, display_end_date: NOW + DAY };

  it("is null for a live listing", () => {
    expect(clearanceUnavailableReason(live, NOW)).toBeNull();
  });

  it("reports an ended offer before anything else", () => {
    // An expired listing that is also sold out should read as ended: the offer
    // is gone either way, and "sold out" implies it might come back.
    expect(
      clearanceUnavailableReason(
        { ...live, quantity: 0, display_end_date: NOW - 1 },
        NOW,
      ),
    ).toBe("This deal has ended");
  });

  it("distinguishes sold out from withdrawn", () => {
    expect(clearanceUnavailableReason({ ...live, quantity: 0 }, NOW)).toBe(
      "Sold out",
    );
    expect(
      clearanceUnavailableReason({ ...live, status: "Inactive" }, NOW),
    ).toBe("No longer available");
  });
});
