import { describe, expect, it } from "vitest";
import {
  computeVendorSplit,
  vendorCommission,
  type SplitLeg,
} from "../convex/lib/vendor_split";
import type { Id } from "../convex/_generated/dataModel";

const vendorId = (n: number) => `vendor_${n}` as Id<"vendors">;

describe("vendorCommission", () => {
  it("percentage commission, rounded", () => {
    expect(vendorCommission(1000, { commission_type: "percentage", commission: 10 })).toBe(100);
    // 333.33 rounds to 333, not truncated.
    expect(vendorCommission(1000, { commission_type: "percentage", commission: 33.333 })).toBe(333);
  });

  it("fixed commission", () => {
    expect(vendorCommission(1000, { commission_type: "fixed", commission: 50 })).toBe(50);
  });

  it("clamps to the gross — a misconfigured fixed fee cannot exceed the basket", () => {
    // A vendor whose commission is misconfigured above their own subtotal must
    // still settle a non-negative net, not owe the platform money.
    expect(vendorCommission(100, { commission_type: "fixed", commission: 500 })).toBe(100);
  });

  it("never negative", () => {
    expect(vendorCommission(1000, { commission_type: "fixed", commission: -50 })).toBe(0);
    expect(vendorCommission(1000, { commission_type: "percentage", commission: -10 })).toBe(0);
  });

  it("zero gross, zero commission — never divides oddly", () => {
    expect(vendorCommission(0, { commission_type: "percentage", commission: 15 })).toBe(0);
    expect(vendorCommission(0, { commission_type: "fixed", commission: 50 })).toBe(0);
  });
});

describe("computeVendorSplit", () => {
  it("a single vendor: net + commission == subtotal, exactly", () => {
    const legs: SplitLeg[] = [{ vendorId: vendorId(1), subtotal: 1000 }];
    const split = computeVendorSplit(legs, [200], () => ({
      commission_type: "percentage",
      commission: 10,
    }));

    expect(split.vendors).toHaveLength(1);
    const v = split.vendors[0]!;
    expect(v.grossMajor).toBe(1000);
    expect(v.commissionMajor).toBe(100);
    expect(v.netMajor).toBe(900);
    expect(v.netMajor + v.commissionMajor).toBe(v.grossMajor);
  });

  it("delivery fee never reaches a vendor's share", () => {
    const legs: SplitLeg[] = [{ vendorId: vendorId(1), subtotal: 1000 }];
    const split = computeVendorSplit(legs, [250], () => ({
      commission_type: "fixed",
      commission: 0,
    }));

    expect(split.vendors[0]!.netMajor).toBe(1000);
    expect(split.deliveryFeeTotalMajor).toBe(250);
    // The vendor's net excludes it entirely — it settles to the platform.
    expect(split.platformMajor).toBe(250);
  });

  it("multi-vendor: independent commission per leg, delivery pooled to the platform", () => {
    const legs: SplitLeg[] = [
      { vendorId: vendorId(1), subtotal: 1000 },
      { vendorId: vendorId(2), subtotal: 2000 },
    ];
    const rates = new Map([
      [vendorId(1), { commission_type: "percentage" as const, commission: 10 }],
      [vendorId(2), { commission_type: "fixed" as const, commission: 150 }],
    ]);
    const split = computeVendorSplit(legs, [200, 300], (id) => rates.get(id)!);

    expect(split.vendors[0]).toMatchObject({ grossMajor: 1000, commissionMajor: 100, netMajor: 900 });
    expect(split.vendors[1]).toMatchObject({ grossMajor: 2000, commissionMajor: 150, netMajor: 1850 });
    expect(split.commissionTotalMajor).toBe(250);
    expect(split.deliveryFeeTotalMajor).toBe(500);
    expect(split.platformMajor).toBe(750);
    expect(split.itemsTotalMajor).toBe(3000);
  });

  it("the whole-basket invariant: vendor nets + platform share == quote total", () => {
    const legs: SplitLeg[] = [
      { vendorId: vendorId(1), subtotal: 733 },
      { vendorId: vendorId(2), subtotal: 1249 },
      { vendorId: vendorId(3), subtotal: 41 },
    ];
    const deliveryFees = [67, 67, 66]; // an apportioned delivery split, e.g.
    const rates = new Map([
      [vendorId(1), { commission_type: "percentage" as const, commission: 12.5 }],
      [vendorId(2), { commission_type: "percentage" as const, commission: 8 }],
      [vendorId(3), { commission_type: "fixed" as const, commission: 5 }],
    ]);
    const split = computeVendorSplit(legs, deliveryFees, (id) => rates.get(id)!);

    const quoteTotal =
      legs.reduce((s, l) => s + l.subtotal, 0) +
      deliveryFees.reduce((s, f) => s + f, 0);
    const settled =
      split.vendors.reduce((s, v) => s + v.netMajor, 0) + split.platformMajor;

    expect(settled).toBe(quoteTotal);
  });

  it("throws on an empty basket rather than producing an empty split", () => {
    expect(() => computeVendorSplit([], [], () => ({ commission_type: "fixed", commission: 0 }))).toThrow();
  });

  it("throws when deliveryFees does not match legs one-for-one", () => {
    const legs: SplitLeg[] = [{ vendorId: vendorId(1), subtotal: 100 }];
    expect(() =>
      computeVendorSplit(legs, [10, 20], () => ({ commission_type: "fixed", commission: 0 })),
    ).toThrow();
  });

  it("a non-integer subtotal (should not happen, but) is still rounded before use", () => {
    const legs: SplitLeg[] = [{ vendorId: vendorId(1), subtotal: 999.6 }];
    const split = computeVendorSplit(legs, [0], () => ({
      commission_type: "percentage",
      commission: 0,
    }));
    expect(split.vendors[0]!.grossMajor).toBe(1000);
  });
});
