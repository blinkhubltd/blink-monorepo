import { describe, expect, it } from "vitest";

import {
  QuoteError,
  buildClearanceQuote,
  buildQuote,
  type ResolvedLine,
} from "../convex/lib/checkout_quote";

/**
 * Clearance pricing, and the one rule that must never leak into it.
 *
 * Clearance items are already discounted, so the free-delivery threshold does
 * not apply — waiving delivery on top erodes the margin twice. That decision is
 * enforced structurally: `buildClearanceQuote` takes settings with no threshold
 * field at all, so there is nothing for a future edit to accidentally consult.
 *
 * These tests exist because sharing a module between the two basket types is the
 * moment the rule becomes easy to lose: a refactor that unifies the builders
 * would pass every existing regular-basket test and quietly start waiving
 * clearance delivery.
 */

const CLEARANCE = { baseFee: 150, extraVendorFee: 50 };
const REGULAR = {
  baseFee: 200,
  extraVendorFee: 50,
  freeThreshold: 2000,
  thresholdFromSetting: true,
};

function line(overrides: Partial<ResolvedLine> = {}): ResolvedLine {
  return {
    productId: "cp1",
    vendorId: "v1",
    name: "Expiring yoghurt",
    quantity: 1,
    price: 100,
    status: "Active",
    available: 10,
    requiresPrescription: false,
    originalPrice: 250,
    discountPercentage: 60,
    sku: "SKU-1",
    ...overrides,
  };
}

describe("the threshold does not apply", () => {
  it("charges the base fee on a basket far above the regular threshold", () => {
    const quote = buildClearanceQuote(
      [line({ price: 5000, quantity: 1 })],
      CLEARANCE,
    );
    expect(quote.deliveryFee).toBe(150);
    expect(quote.freeDeliveryApplied).toBe(false);
    expect(quote.total).toBe(5150);
  });

  it("records the threshold as 0, meaning no waiver was available", () => {
    // Not the real threshold: recording a number that was never consulted
    // invites a later reader to conclude the customer missed out on a waiver.
    const quote = buildClearanceQuote([line()], CLEARANCE);
    expect(quote.freeDeliveryThreshold).toBe(0);
  });

  it("differs from a regular basket at the same subtotal", () => {
    const clearance = buildClearanceQuote(
      [line({ price: 2500 })],
      CLEARANCE,
    );
    const regular = buildQuote(
      [line({ productId: "p1", price: 2500 })],
      REGULAR,
    );
    // The regular basket qualifies; the clearance one never does.
    expect(regular.freeDeliveryApplied).toBe(true);
    expect(regular.deliveryFee).toBe(0);
    expect(clearance.deliveryFee).toBe(150);
  });

  it("marks the quote as clearance, so finalisation writes the right tables", () => {
    expect(buildClearanceQuote([line()], CLEARANCE).isClearance).toBe(true);
    expect(buildQuote([line({ productId: "p1" })], REGULAR).isClearance).toBe(
      undefined,
    );
  });
});

describe("multi-vendor clearance", () => {
  it("charges base plus one extra per additional shop", () => {
    const quote = buildClearanceQuote(
      [
        line({ vendorId: "v1", price: 300 }),
        line({ productId: "cp2", vendorId: "v2", price: 300 }),
        line({ productId: "cp3", vendorId: "v3", price: 300 }),
      ],
      CLEARANCE,
    );
    expect(quote.vendorCount).toBe(3);
    expect(quote.deliveryFee).toBe(250);
  });

  it("gives every vendor its own leg — the old path wrote one order", () => {
    // `createClearanceOrder` computed the fee from the distinct vendor count and
    // then attributed the whole order to a single vendor_id.
    const quote = buildClearanceQuote(
      [
        line({ vendorId: "v1" }),
        line({ productId: "cp2", vendorId: "v2" }),
      ],
      CLEARANCE,
    );
    expect(quote.legs.map((l) => l.vendorId).sort()).toEqual(["v1", "v2"]);
  });

  it("apportions the fee so the legs sum to it exactly", () => {
    const quote = buildClearanceQuote(
      [
        line({ vendorId: "v1", price: 300 }),
        line({ productId: "cp2", vendorId: "v2", price: 300 }),
        line({ productId: "cp3", vendorId: "v3", price: 300 }),
      ],
      CLEARANCE,
    );
    const summed = quote.legs.reduce((sum, l) => sum + l.deliveryFee, 0);
    expect(summed).toBe(quote.deliveryFee);
    // 250 over three equal legs: 83.34 / 83.33 / 83.33 in whole cents.
    expect(quote.legs.every((l) => l.deliveryFee > 0)).toBe(true);
  });

  it("balances end to end", () => {
    const quote = buildClearanceQuote(
      [
        line({ vendorId: "v1", price: 777, quantity: 3 }),
        line({ productId: "cp2", vendorId: "v2", price: 133, quantity: 7 }),
      ],
      CLEARANCE,
    );
    expect(quote.legs.reduce((s, l) => s + l.subtotal, 0)).toBe(quote.subtotal);
    expect(quote.total).toBe(quote.subtotal + quote.deliveryFee);
    expect(quote.legs.reduce((s, l) => s + l.total, 0)).toBe(quote.total);
  });
});

describe("what cannot be sold", () => {
  it("drops an expired listing and prices the rest", () => {
    // The caller folds the display window into `status`, because the pure
    // builder has no clock.
    const quote = buildClearanceQuote(
      [
        line({ status: "Expired" }),
        line({ productId: "cp2", price: 400 }),
      ],
      CLEARANCE,
    );
    expect(quote.itemCount).toBe(1);
    expect(quote.subtotal).toBe(400);
  });

  it("refuses a basket where everything has ended", () => {
    expect(() =>
      buildClearanceQuote([line({ status: "Expired" })], CLEARANCE),
    ).toThrow(QuoteError);
  });

  it("refuses an empty basket", () => {
    expect(() => buildClearanceQuote([], CLEARANCE)).toThrow(QuoteError);
  });

  it("caps a line at the stock that is left", () => {
    const quote = buildClearanceQuote(
      [line({ quantity: 10, available: 3, price: 100 })],
      CLEARANCE,
    );
    expect(quote.itemCount).toBe(3);
    expect(quote.subtotal).toBe(300);
  });

  it("drops a listing with no vendor rather than pricing it", () => {
    expect(() =>
      buildClearanceQuote([line({ vendorId: undefined })], CLEARANCE),
    ).toThrow(QuoteError);
  });
});

describe("the receipt fields", () => {
  it("carries the original price and discount through to the quote", () => {
    // `clearance_order_items` records what the customer was shown, so these
    // must survive on the quote — at finalisation the listing may have changed
    // or expired.
    const quote = buildClearanceQuote([line()], CLEARANCE);
    const quoted = quote.legs[0]!.lines[0]!;
    expect(quoted.originalPrice).toBe(250);
    expect(quoted.discountPercentage).toBe(60);
    expect(quoted.sku).toBe("SKU-1");
    expect(quoted.unitPrice).toBe(100);
  });

  it("omits the clearance fields on a regular quote", () => {
    const quote = buildQuote(
      [
        {
          productId: "p1",
          vendorId: "v1",
          name: "Milk",
          quantity: 1,
          price: 100,
          status: "Active",
          available: 5,
          requiresPrescription: false,
        },
      ],
      REGULAR,
    );
    const quoted = quote.legs[0]!.lines[0]!;
    expect(quoted.originalPrice).toBeUndefined();
    expect(quoted.discountPercentage).toBeUndefined();
  });
});
