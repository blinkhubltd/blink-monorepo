import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTRA_VENDOR_FEE_KES,
  DEFAULT_FREE_DELIVERY_THRESHOLD_KES,
  apportion,
  priceBasketDelivery,
  priceClearanceDelivery,
  qualifiesForFreeDelivery,
  resolveFeeSetting,
  resolveNumericSetting,
  type DeliveryPricingSettings,
  type VendorLeg,
} from "../convex/lib/delivery_fee";

/**
 * Delivery pricing.
 *
 * This is the one module in the app where a wrong answer is a wrong charge, and
 * every failure mode here is silent: a fee that renders as a plausible number,
 * a total that is off by one shilling, a threshold that quietly stops applying.
 * So the tests assert invariants and specific allocations rather than just
 * "returns a number".
 */

const SETTINGS: DeliveryPricingSettings = {
  baseFee: 200,
  extraVendorFee: 50,
  freeThreshold: 2000,
};

function legs(...subtotals: number[]): VendorLeg[] {
  return subtotals.map((subtotal, i) => ({
    // Padded so lexicographic order matches numeric order — the tie-break is
    // by vendor id, and "v10" sorts before "v2" otherwise.
    vendorId: `v${String(i).padStart(2, "0")}`,
    subtotal,
  }));
}

const feeFor = (...subtotals: number[]) =>
  priceBasketDelivery(legs(...subtotals), SETTINGS).basketDeliveryFee;

describe("qualifiesForFreeDelivery", () => {
  it("is inclusive at the threshold", () => {
    expect(qualifiesForFreeDelivery(1999, 2000)).toBe(false);
    expect(qualifiesForFreeDelivery(2000, 2000)).toBe(true);
    expect(qualifiesForFreeDelivery(2001, 2000)).toBe(true);
  });

  it("never qualifies an empty or negative basket", () => {
    // Guarded before the comparison: with a threshold of 0 the naive
    // `subtotal >= threshold` would waive the fee on an empty basket.
    expect(qualifiesForFreeDelivery(0, 2000)).toBe(false);
    expect(qualifiesForFreeDelivery(0, 0)).toBe(false);
    expect(qualifiesForFreeDelivery(-500, 2000)).toBe(false);
  });
});

describe("the fee table", () => {
  // The exact table in the module docstring, so a formula change has to update
  // the documentation too.
  it("charges base + extra per additional shop below the threshold", () => {
    expect(feeFor(1900)).toBe(200);
    expect(feeFor(950, 950)).toBe(250);
    expect(feeFor(475, 475, 475, 475)).toBe(350);
  });

  it("waives exactly one base fee at or above the threshold", () => {
    expect(feeFor(2000)).toBe(0);
    expect(feeFor(1000, 1000)).toBe(50);
    expect(feeFor(500, 500, 500, 500)).toBe(150);
  });

  it("does not charge a multi-shop basket a full fee per shop", () => {
    // The decision that removes the cliff: two shops is 250, not 400.
    expect(feeFor(950, 950)).not.toBe(400);
  });

  it("caps platform exposure at one base fee, not one per shop", () => {
    // A four-shop basket at exactly the threshold must not waive 4 x 200.
    const priced = priceBasketDelivery(legs(500, 500, 500, 500), SETTINGS);
    expect(priced.grossDeliveryFee).toBe(350);
    expect(priced.grossDeliveryFee - priced.basketDeliveryFee).toBe(200);
  });

  it("is continuous across the threshold apart from the base fee", () => {
    // The only permitted discontinuity is `base`. Anything larger means the
    // waiver is scaling with vendor count again.
    for (const shops of [1, 2, 3, 4, 5]) {
      const below = Array.from({ length: shops }, () => 1999 / shops);
      const above = Array.from({ length: shops }, () => 2000 / shops);
      const jump = feeFor(...below) - feeFor(...above);
      expect(jump).toBe(SETTINGS.baseFee);
    }
  });
});

describe("empty and degenerate baskets", () => {
  it("charges nothing for no legs", () => {
    const priced = priceBasketDelivery([], SETTINGS);
    expect(priced.basketDeliveryFee).toBe(0);
    expect(priced.waived).toBe(false);
  });

  it("charges nothing for a zero-value basket", () => {
    const priced = priceBasketDelivery(legs(0, 0), SETTINGS);
    expect(priced.basketDeliveryFee).toBe(0);
    expect(priced.legs.every((l) => l.delivery_fee === 0)).toBe(true);
  });

  it("clamps a negative subtotal to zero rather than producing a negative fee", () => {
    const priced = priceBasketDelivery(legs(-500), SETTINGS);
    expect(priced.basketSubtotal).toBe(0);
    expect(priced.basketDeliveryFee).toBe(0);
  });

  it("reports the gross fee even when waived, so a receipt can show the saving", () => {
    const priced = priceBasketDelivery(legs(3000), SETTINGS);
    expect(priced.waived).toBe(true);
    expect(priced.basketDeliveryFee).toBe(0);
    expect(priced.grossDeliveryFee).toBe(200);
  });
});

describe("apportionment", () => {
  it("sums to the whole for every basket shape", () => {
    // The invariant that matters: no shilling created or destroyed.
    const shapes: number[][] = [
      [1000],
      [700, 300],
      [1000, 600, 400],
      [300, 300, 300],
      [1, 1, 1, 1, 1, 1],
      [999, 1, 1],
      [0, 500],
      [0, 0, 0],
      [1_000_000, 3],
    ];
    for (const shape of shapes) {
      const priced = priceBasketDelivery(legs(...shape), SETTINGS);
      const summed = priced.legs.reduce((s, l) => s + l.delivery_fee, 0);
      expect(summed).toBe(priced.basketDeliveryFee);
    }
  });

  it("distributes a remainder to the largest fractions, tie-broken by vendor id", () => {
    // 200 across three equal legs: 66.67 each, so floors are 66/66/66 = 198
    // with a deficit of 2. All fractions tie, so the two lowest vendor ids win.
    expect(apportion(200, [300, 300, 300], ["v00", "v01", "v02"])).toEqual([
      67, 67, 66,
    ]);
  });

  it("is pro-rata, not an even split", () => {
    // A shop supplying 70% of the basket carries 70% of the delivery. An even
    // split would charge the same delivery on a 100 line as on a 2,900 one.
    expect(apportion(200, [700, 300], ["v00", "v01"])).toEqual([140, 60]);
    expect(apportion(200, [1000, 600, 400], ["v00", "v01", "v02"])).toEqual([
      100, 60, 40,
    ]);
  });

  it("does not depend on the order the legs arrive in", () => {
    // Callers build legs by iterating a Map or object, so array order is an
    // artefact. If it leaked into the tie-break, the same basket would price
    // differently between two runs.
    const forward = priceBasketDelivery(
      [
        { vendorId: "aaa", subtotal: 300 },
        { vendorId: "bbb", subtotal: 300 },
        { vendorId: "ccc", subtotal: 300 },
      ],
      SETTINGS,
    );
    const reversed = priceBasketDelivery(
      [
        { vendorId: "ccc", subtotal: 300 },
        { vendorId: "bbb", subtotal: 300 },
        { vendorId: "aaa", subtotal: 300 },
      ],
      SETTINGS,
    );
    const byVendor = (p: typeof forward) =>
      Object.fromEntries(p.legs.map((l) => [l.vendorId, l.delivery_fee]));

    expect(byVendor(forward)).toEqual(byVendor(reversed));
  });

  it("apportions a zero-value multi-vendor basket without dividing by zero", () => {
    expect(apportion(100, [0, 0], ["v00", "v01"])).toEqual([50, 50]);
  });

  it("refuses a non-integer total rather than rounding silently", () => {
    expect(() => apportion(100.5, [1], ["v00"])).toThrow(/integer/);
  });
});

describe("a cancelled leg leaves the arithmetic intact", () => {
  it("refunding one leg leaves the survivors summing to what is still owed", () => {
    // The reason apportionment is pro-rata and immutable: each order carries
    // its own settled figure, so cancelling one has a defined answer.
    const priced = priceBasketDelivery(legs(300, 300, 300), SETTINGS);
    const [a, b, c] = priced.legs;

    expect(a!.delivery_fee + b!.delivery_fee + c!.delivery_fee).toBe(
      priced.basketDeliveryFee,
    );

    // Cancel the third: refund its own fee, survivors unchanged.
    const refund = c!.delivery_fee;
    const stillOwed = priced.basketDeliveryFee - refund;
    expect(a!.delivery_fee + b!.delivery_fee).toBe(stillOwed);
  });
});

describe("resolveNumericSetting — thresholds", () => {
  it("uses a valid stored value", () => {
    expect(resolveNumericSetting("2500", 2000)).toEqual({
      value: 2500,
      resolution: "setting",
    });
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["not a number", "abc"],
    ["negative", "-1"],
    ["zero", "0"],
    ["grouped", "2,000"],
    ["NaN literal", "NaN"],
    ["Infinity literal", "Infinity"],
    ["overflow", "1e400"],
  ])("falls back on a %s value", (_label, raw) => {
    const resolved = resolveNumericSetting(raw as string | null | undefined, 2000);
    expect(resolved).toEqual({ value: 2000, resolution: "fallback" });
  });

  it("rejects a grouped number rather than truncating it", () => {
    // parseFloat("2,000") is 2 — a 2,000 threshold silently becoming 2 would
    // give every basket free delivery. Number() rejects it outright.
    expect(resolveNumericSetting("2,000", 2000).value).not.toBe(2);
  });

  it("treats a stored zero as unusable, not as free-for-everyone", () => {
    // "Always free" is delivery_fee = 0. A threshold of 0 is meaningless.
    expect(resolveNumericSetting("0", 2000).resolution).toBe("fallback");
  });
});

describe("resolveFeeSetting — fees, where zero IS valid", () => {
  it("accepts a stored zero", () => {
    // This is how free delivery for everyone is configured.
    expect(resolveFeeSetting("0", 200)).toEqual({
      value: 0,
      resolution: "setting",
    });
  });

  it("still falls back on a negative or malformed fee", () => {
    expect(resolveFeeSetting("-5", 200).resolution).toBe("fallback");
    expect(resolveFeeSetting("abc", 200).resolution).toBe("fallback");
    expect(resolveFeeSetting(undefined, 200).resolution).toBe("fallback");
  });
});

describe("never NaN, whatever the inputs", () => {
  it("produces finite numbers across a matrix of settings and baskets", () => {
    // The failure this guards: a malformed setting reaching the arithmetic and
    // rendering as "KES NaN" — or worse, being stored on an order.
    const settingSets: DeliveryPricingSettings[] = [
      SETTINGS,
      { baseFee: 0, extraVendorFee: 0, freeThreshold: 2000 },
      {
        baseFee: DEFAULT_EXTRA_VENDOR_FEE_KES,
        extraVendorFee: 0,
        freeThreshold: DEFAULT_FREE_DELIVERY_THRESHOLD_KES,
      },
    ];
    const baskets = [[0], [1], [1999], [2000], [1, 2, 3], [0, 0], [12345, 1]];

    for (const settings of settingSets) {
      for (const basket of baskets) {
        const priced = priceBasketDelivery(legs(...basket), settings);
        expect(Number.isFinite(priced.basketDeliveryFee)).toBe(true);
        expect(Number.isFinite(priced.grossDeliveryFee)).toBe(true);
        expect(Number.isFinite(priced.basketSubtotal)).toBe(true);
        for (const leg of priced.legs) {
          expect(Number.isFinite(leg.delivery_fee)).toBe(true);
        }
      }
    }
  });
});

describe("programmer errors are loud", () => {
  it("throws on a non-finite leg subtotal", () => {
    // A malformed SETTING falls back, because there is a safe answer. A
    // non-finite subtotal is a bug in our own code with no safe number to
    // invent, so it must not price silently.
    expect(() =>
      priceBasketDelivery([{ vendorId: "v00", subtotal: Number.NaN }], SETTINGS),
    ).toThrow(/non-finite/);
  });

  it("throws when a vendor appears twice", () => {
    // Legs must already be grouped. A duplicate would double-count that
    // vendor's weight and under-charge everyone else.
    expect(() =>
      priceBasketDelivery(
        [
          { vendorId: "v00", subtotal: 100 },
          { vendorId: "v00", subtotal: 100 },
        ],
        SETTINGS,
      ),
    ).toThrow(/appears twice/);
  });
});

describe("clearance is deliberately excluded from the waiver", () => {
  it("uses the same base + extra shape", () => {
    expect(priceClearanceDelivery(1, { baseFee: 150, extraVendorFee: 50 })).toBe(150);
    expect(priceClearanceDelivery(2, { baseFee: 150, extraVendorFee: 50 })).toBe(200);
    expect(priceClearanceDelivery(3, { baseFee: 150, extraVendorFee: 50 })).toBe(250);
  });

  it("charges nothing for no vendors", () => {
    expect(priceClearanceDelivery(0, { baseFee: 150, extraVendorFee: 50 })).toBe(0);
  });

  it("takes no subtotal, so no threshold can leak in", () => {
    // Asserted structurally: the signature has nowhere to put a basket
    // subtotal, so a future change that starts waiving clearance delivery
    // cannot happen by accident — it has to change this contract first.
    expect(priceClearanceDelivery.length).toBe(2);
  });

  it("matches the formula orders.ts already used for clearance", () => {
    // orders.ts:1341-1379 computed base + extra * max(0, N-1). Both paths now
    // agree, which is the point of folding them onto one module.
    const base = 150;
    const extra = 50;
    for (const n of [1, 2, 3, 4, 5]) {
      const legacy = base + Math.max(0, n - 1) * extra;
      expect(priceClearanceDelivery(n, { baseFee: base, extraVendorFee: extra })).toBe(
        legacy,
      );
    }
  });
});
