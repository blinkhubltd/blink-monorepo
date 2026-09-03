import { describe, expect, it } from "vitest";
import {
  QuoteError,
  buildQuote,
  describeQuoteChanges,
  quoteMatchesExpected,
  toMinorUnits,
  type ResolvedLine,
} from "../convex/lib/checkout_quote";
import type { DeliveryPricingSettings } from "../convex/lib/delivery_fee";

/**
 * The priced basket.
 *
 * This number is charged to a card, so the tests assert the arithmetic closes
 * rather than that the function returns something plausible. The dangerous
 * failures here are all silent: legs that do not sum to the total mean the
 * customer is charged one figure and the orders record another, and nothing
 * downstream compares them.
 */

const SETTINGS: DeliveryPricingSettings = {
  baseFee: 200,
  extraVendorFee: 50,
  freeThreshold: 2000,
};

function line(over: Partial<ResolvedLine> = {}): ResolvedLine {
  return {
    productId: "p1",
    vendorId: "v1",
    name: "Bread",
    quantity: 1,
    price: 100,
    status: "Active",
    available: 10,
    requiresPrescription: false,
    ...over,
  };
}

describe("buildQuote — the arithmetic closes", () => {
  it("legs sum to the subtotal, fees sum to the delivery fee, and the total is their sum", () => {
    const quote = buildQuote(
      [
        line({ productId: "a", vendorId: "v1", price: 300, quantity: 2 }),
        line({ productId: "b", vendorId: "v2", price: 250, quantity: 1 }),
        line({ productId: "c", vendorId: "v2", price: 100, quantity: 3 }),
      ],
      SETTINGS,
    );

    const legSubtotals = quote.legs.reduce((s, l) => s + l.subtotal, 0);
    const legFees = quote.legs.reduce((s, l) => s + l.deliveryFee, 0);

    expect(legSubtotals).toBe(quote.subtotal);
    expect(legFees).toBe(quote.deliveryFee);
    expect(quote.total).toBe(quote.subtotal + quote.tax + quote.deliveryFee);
  });

  it("balances across many basket shapes", () => {
    // The invariant is asserted inside buildQuote too, so a shape that cannot
    // balance throws rather than returning a wrong number.
    const shapes: ResolvedLine[][] = [
      [line()],
      [line({ vendorId: "v1" }), line({ productId: "b", vendorId: "v2" })],
      [
        line({ productId: "a", vendorId: "v1", price: 333, quantity: 3 }),
        line({ productId: "b", vendorId: "v2", price: 333, quantity: 3 }),
        line({ productId: "c", vendorId: "v3", price: 333, quantity: 3 }),
      ],
      [line({ price: 5000, quantity: 1 })],
    ];
    for (const shape of shapes) {
      expect(() => buildQuote(shape, SETTINGS)).not.toThrow();
    }
  });

  it("each leg's total is its own subtotal plus its own fee", () => {
    // So an order read in isolation is internally consistent.
    const quote = buildQuote(
      [
        line({ productId: "a", vendorId: "v1", price: 700 }),
        line({ productId: "b", vendorId: "v2", price: 300 }),
      ],
      SETTINGS,
    );
    for (const leg of quote.legs) {
      expect(leg.total).toBe(leg.subtotal + leg.deliveryFee);
    }
  });
});

describe("buildQuote — the delivery rule reaches the quote", () => {
  it("charges the base fee below the threshold", () => {
    const quote = buildQuote([line({ price: 1900 })], SETTINGS);
    expect(quote.deliveryFee).toBe(200);
    expect(quote.freeDeliveryApplied).toBe(false);
    expect(quote.total).toBe(2100);
  });

  it("waives it at the threshold", () => {
    const quote = buildQuote([line({ price: 2000 })], SETTINGS);
    expect(quote.deliveryFee).toBe(0);
    expect(quote.freeDeliveryApplied).toBe(true);
    // Still reported, so a receipt can say what was saved.
    expect(quote.grossDeliveryFee).toBe(200);
    expect(quote.total).toBe(2000);
  });

  it("charges base plus a pickup fee per extra shop", () => {
    const quote = buildQuote(
      [
        line({ productId: "a", vendorId: "v1", price: 950 }),
        line({ productId: "b", vendorId: "v2", price: 950 }),
      ],
      SETTINGS,
    );
    expect(quote.deliveryFee).toBe(250);
  });

  it("records the threshold it used", () => {
    // So a later settings change cannot make a past order look wrong.
    const quote = buildQuote([line()], { ...SETTINGS, freeThreshold: 3000 });
    expect(quote.freeDeliveryThreshold).toBe(3000);
  });
});

describe("buildQuote — unsellable lines", () => {
  it("drops an inactive line but keeps the rest", () => {
    const quote = buildQuote(
      [
        line({ productId: "ok", price: 500 }),
        line({ productId: "gone", price: 900, status: "Archived" }),
      ],
      SETTINGS,
    );
    // The customer keeps what they can still buy, and the dropped line does not
    // contribute to the total they are charged.
    expect(quote.subtotal).toBe(500);
    expect(quote.legs.flatMap((l) => l.lines).map((l) => l.productId)).toEqual([
      "ok",
    ]);
  });

  it("drops an out-of-stock line", () => {
    const quote = buildQuote(
      [
        line({ productId: "ok", price: 500 }),
        line({ productId: "empty", price: 900, available: 0 }),
      ],
      SETTINGS,
    );
    expect(quote.subtotal).toBe(500);
  });

  it("drops a line whose product has no vendor", () => {
    // vendor_id is optional in the schema, so such products exist and cannot be
    // delivered by anyone.
    const quote = buildQuote(
      [
        line({ productId: "ok", price: 500 }),
        line({ productId: "orphan", price: 900, vendorId: undefined }),
      ],
      SETTINGS,
    );
    expect(quote.subtotal).toBe(500);
  });

  it("caps a line to available stock rather than rejecting it", () => {
    // A basket that outran stock still checks out, at the reduced quantity —
    // and the quantity is visible in the quote the customer approves.
    const quote = buildQuote(
      [line({ quantity: 10, available: 3, price: 100 })],
      SETTINGS,
    );
    expect(quote.legs[0]!.lines[0]!.quantity).toBe(3);
    expect(quote.subtotal).toBe(300);
  });

  it("refuses an empty basket", () => {
    expect(() => buildQuote([], SETTINGS)).toThrow(QuoteError);
  });

  it("refuses a basket where nothing is sellable", () => {
    // Better than quoting zero and charging the customer a delivery fee for
    // nothing.
    expect(() =>
      buildQuote([line({ status: "Archived" }), line({ available: 0 })], SETTINGS),
    ).toThrow(/available/);
  });
});

describe("buildQuote — what the quote carries", () => {
  it("snapshots the unit price, so a later price change does not alter it", () => {
    const quote = buildQuote([line({ price: 250, quantity: 2 })], SETTINGS);
    expect(quote.legs[0]!.lines[0]!.unitPrice).toBe(250);
    expect(quote.legs[0]!.lines[0]!.lineTotal).toBe(500);
  });

  it("flags a prescription requirement anywhere in the basket", () => {
    const quote = buildQuote(
      [
        line({ productId: "a" }),
        line({ productId: "b", requiresPrescription: true }),
      ],
      SETTINGS,
    );
    expect(quote.requiresPrescription).toBe(true);
  });

  it("counts units, not lines", () => {
    const quote = buildQuote(
      [
        line({ productId: "a", quantity: 2 }),
        line({ productId: "b", quantity: 3 }),
      ],
      SETTINGS,
    );
    expect(quote.itemCount).toBe(5);
  });

  it("groups lines under their own vendor", () => {
    const quote = buildQuote(
      [
        line({ productId: "a", vendorId: "v1" }),
        line({ productId: "b", vendorId: "v2" }),
        line({ productId: "c", vendorId: "v1" }),
      ],
      SETTINGS,
    );
    expect(quote.vendorCount).toBe(2);
    const v1 = quote.legs.find((l) => l.vendorId === "v1")!;
    expect(v1.lines.map((l) => l.productId).sort()).toEqual(["a", "c"]);
  });

  it("records tax explicitly as zero", () => {
    // The two apps disagreed — cart used taxRate 0, checkout divided by 1.16 to
    // back VAT out of a VAT-inclusive price. Storing it makes the assumption
    // legible instead of inferred from an absence.
    expect(buildQuote([line()], SETTINGS).tax).toBe(0);
  });
});

describe("comparing against what the customer was shown", () => {
  it("compares in minor units, not floats", () => {
    expect(toMinorUnits(1250.005)).toBe(125001);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
  });

  it("accepts a matching expected total", () => {
    const quote = buildQuote([line({ price: 1900 })], SETTINGS);
    expect(quoteMatchesExpected(quote, 2100)).toBe(true);
  });

  it("rejects a mismatch", () => {
    const quote = buildQuote([line({ price: 1900 })], SETTINGS);
    expect(quoteMatchesExpected(quote, 2000)).toBe(false);
  });

  it("accepts when the client sent no expectation", () => {
    const quote = buildQuote([line()], SETTINGS);
    expect(quoteMatchesExpected(quote, undefined)).toBe(true);
  });
});

describe("describeQuoteChanges", () => {
  const before = buildQuote(
    [
      line({ productId: "a", name: "Bread", price: 100, quantity: 2 }),
      line({ productId: "b", name: "Milk", price: 200, quantity: 1 }),
    ],
    SETTINGS,
  );

  it("names an item that became unavailable", () => {
    const after = buildQuote(
      [line({ productId: "a", name: "Bread", price: 100, quantity: 2 })],
      SETTINGS,
    );
    expect(describeQuoteChanges(before, after)).toContain(
      "Milk is no longer available",
    );
  });

  it("names a price change", () => {
    const after = buildQuote(
      [
        line({ productId: "a", name: "Bread", price: 150, quantity: 2 }),
        line({ productId: "b", name: "Milk", price: 200, quantity: 1 }),
      ],
      SETTINGS,
    );
    expect(describeQuoteChanges(before, after)).toContain("Bread changed price");
  });

  it("names a quantity that was capped by stock", () => {
    const after = buildQuote(
      [
        line({ productId: "a", name: "Bread", price: 100, quantity: 2, available: 1 }),
        line({ productId: "b", name: "Milk", price: 200, quantity: 1 }),
      ],
      SETTINGS,
    );
    expect(describeQuoteChanges(before, after)).toContain(
      "Bread is limited to 1",
    );
  });

  it("says nothing when nothing changed", () => {
    expect(describeQuoteChanges(before, before)).toEqual([]);
  });

  it("does not mention the fee separately when line changes already explain it", () => {
    // Otherwise a customer sees "Milk is no longer available" AND "the delivery
    // fee changed", which reads as two problems rather than one consequence.
    const after = buildQuote(
      [line({ productId: "a", name: "Bread", price: 100, quantity: 2 })],
      SETTINGS,
    );
    const changes = describeQuoteChanges(before, after);
    expect(changes).not.toContain("The delivery fee changed");
  });
});
