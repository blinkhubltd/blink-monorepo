import { describe, expect, it } from "vitest";
import {
  bucketsFor,
  completedFromShipments,
} from "../lib/data/buckets";

/** Wednesday 2026-08-26, 18:00 local. */
const NOW = new Date(2026, 7, 26, 18, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function at(y: number, m: number, d: number, h: number) {
  return { completedAt: new Date(y, m, d, h, 0).getTime() };
}

describe("completedFromShipments", () => {
  it("counts only delivered shipments", () => {
    const out = completedFromShipments([
      { status: "Delivered", updated_at: 10 },
      { status: "Out for Delivery", updated_at: 20 },
      { status: "Failed Delivery", updated_at: 30 },
    ]);
    expect(out).toEqual([{ completedAt: 10 }]);
  });
});

describe("bucketsFor daily", () => {
  it("slices today into the design's two-hour bands", () => {
    const buckets = bucketsFor("daily", [], NOW);
    expect(buckets.map((b) => b.label)).toEqual([
      "8am",
      "10am",
      "12pm",
      "2pm",
      "4pm",
      "6pm",
    ]);
  });

  it("counts a delivery into its band", () => {
    const buckets = bucketsFor(
      "daily",
      [at(2026, 7, 26, 10), at(2026, 7, 26, 11), at(2026, 7, 26, 14)],
      NOW,
    );
    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b.value]));
    expect(byLabel["10am"]).toBe(2);
    expect(byLabel["2pm"]).toBe(1);
    expect(byLabel["8am"]).toBe(0);
  });

  it("folds an early start into the first band rather than dropping it", () => {
    // A rider who starts at 6am should still see those deliveries counted.
    const buckets = bucketsFor("daily", [at(2026, 7, 26, 6)], NOW);
    expect(buckets[0]!.value).toBe(1);
  });

  it("folds a late finish into the last band", () => {
    const buckets = bucketsFor("daily", [at(2026, 7, 26, 23)], NOW);
    expect(buckets[buckets.length - 1]!.value).toBe(1);
  });

  it("ignores other days", () => {
    const buckets = bucketsFor("daily", [at(2026, 7, 25, 10)], NOW);
    expect(buckets.reduce((s, b) => s + b.value, 0)).toBe(0);
  });
});

describe("bucketsFor weekly", () => {
  it("returns seven days ending today, oldest first", () => {
    const buckets = bucketsFor("weekly", [], NOW);
    expect(buckets).toHaveLength(7);
    // 2026-08-26 is a Wednesday, so the window runs Thu -> Wed.
    expect(buckets[6]!.label).toBe("Wed");
    expect(buckets[0]!.label).toBe("Thu");
  });

  it("counts today into the last bucket", () => {
    const buckets = bucketsFor("weekly", [at(2026, 7, 26, 10)], NOW);
    expect(buckets[6]!.value).toBe(1);
  });

  it("excludes anything older than the window", () => {
    const buckets = bucketsFor(
      "weekly",
      [{ completedAt: NOW - 8 * DAY }],
      NOW,
    );
    expect(buckets.reduce((s, b) => s + b.value, 0)).toBe(0);
  });
});

describe("bucketsFor monthly", () => {
  it("returns four trailing weeks, oldest first", () => {
    const buckets = bucketsFor("monthly", [], NOW);
    expect(buckets.map((b) => b.label)).toEqual([
      "Wk 1",
      "Wk 2",
      "Wk 3",
      "Wk 4",
    ]);
  });

  it("assigns each delivery to the right trailing week", () => {
    // Windows are measured back from midnight tonight, so Wk4 covers the last
    // 7 days, Wk3 the 14-7 day range, Wk2 21-14, and Wk1 28-21.
    const buckets = bucketsFor(
      "monthly",
      [
        { completedAt: NOW },
        { completedAt: NOW - 20 * DAY },
        { completedAt: NOW - 25 * DAY },
      ],
      NOW,
    );
    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b.value]));
    expect(byLabel["Wk 4"]).toBe(1);
    expect(byLabel["Wk 2"]).toBe(1);
    expect(byLabel["Wk 1"]).toBe(1);
    expect(byLabel["Wk 3"]).toBe(0);
  });

  it("excludes anything older than the four-week window", () => {
    const buckets = bucketsFor("monthly", [{ completedAt: NOW - 29 * DAY }], NOW);
    expect(buckets.reduce((s, b) => s + b.value, 0)).toBe(0);
  });

  it("does not double-count a delivery across adjacent weeks", () => {
    const buckets = bucketsFor("monthly", [{ completedAt: NOW - 7 * DAY }], NOW);
    expect(buckets.reduce((s, b) => s + b.value, 0)).toBe(1);
  });
});
