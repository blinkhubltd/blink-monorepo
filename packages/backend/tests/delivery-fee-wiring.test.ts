import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * That the fee rule stays wired to the thing it controls.
 *
 * A setting decouples from its enforcement silently: the admin page saves a
 * value, the code reads a different key, and nobody notices because both halves
 * work in isolation. That is why the radius limit exports
 * `VENDOR_SERVICE_RADIUS_LIMIT_KEY` as a constant instead of typing the string
 * three times, and this test is what makes the same discipline hold for the
 * delivery keys.
 *
 * It also guards against the literals coming back. `250`, `2000` and the flat
 * `200` were previously scattered across three files that disagreed, and the
 * whole point of `lib/delivery_fee.ts` is that those numbers now exist in
 * exactly one place.
 */

const BACKEND = join(__dirname, "..", "convex");
const read = (...parts: string[]) => readFileSync(join(BACKEND, ...parts), "utf8");

/**
 * Comments removed, so the scan reads CODE and not prose about code.
 *
 * Without this every one of the "the literal has not come back" assertions
 * fails against the comment explaining that the literal was removed — which is
 * exactly the shape of false positive that gets a guard test deleted rather
 * than fixed.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const settings = read("data", "platform_settings.ts");
const cart = read("data", "cart.ts");
const orders = read("data", "orders.ts");
const feeModule = read("lib", "delivery_fee.ts");

const cartCode = stripComments(cart);
const ordersCode = stripComments(orders);
const feeCode = stripComments(feeModule);

describe("the key constants", () => {
  const KEYS = [
    ["DELIVERY_FEE_KEY", "delivery_fee"],
    ["CLEARANCE_DELIVERY_FEE_KEY", "clearance_delivery_fee"],
    ["EXTRA_VENDOR_FEE_KEY", "clearance_extra_vendor_fee"],
    ["FREE_DELIVERY_THRESHOLD_KEY", "free_delivery_threshold"],
  ] as const;

  it.each(KEYS)("%s is exported", (constant) => {
    expect(settings).toMatch(new RegExp(`export const ${constant} =`));
  });

  it.each(KEYS)("%s's raw string appears only in its own declaration", (
    constant,
    literal,
  ) => {
    // Anywhere else in the backend and the key has been re-typed by hand, which
    // is how a rename decouples the setting from its reader.
    const occurrences = settings.split(`"${literal}"`).length - 1;
    expect(
      occurrences,
      `"${literal}" should appear once (in ${constant}); found ${occurrences}`,
    ).toBe(1);
  });

  it("the seeder references the constants, not re-typed strings", () => {
    for (const [constant] of KEYS) {
      expect(settings).toMatch(new RegExp(`key: ${constant},`));
    }
  });
});

describe("the fee numbers live in one place", () => {
  it("the removed 250 literal has not come back to cart.ts", () => {
    // cart.getCartSummary hardcoded `subtotal >= 2000 ? 0 : 250`. It was the
    // only place either number existed, no screen called it, and checkout
    // charged a flat fee — so the free delivery it implied was never offered.
    expect(cartCode).not.toMatch(/>=\s*2000\s*\?/);
    expect(cartCode).not.toMatch(/:\s*250\b/);
  });

  it("orders.ts no longer carries its own clearance fee defaults", () => {
    // It had a local `parseNonNegative` with 150/50 baked in, so a settings
    // change reached the quote and not the charge.
    expect(ordersCode).not.toMatch(/parseNonNegative/);
    expect(ordersCode).toMatch(/readClearanceDeliveryPricing/);
    expect(ordersCode).toMatch(/priceClearanceDelivery/);
  });

  it("declares its numeric defaults only in the pure module", () => {
    expect(feeModule).toMatch(/DEFAULT_FREE_DELIVERY_THRESHOLD_KES = 2000/);
    expect(feeModule).toMatch(/DEFAULT_DELIVERY_FEE_KES = 200/);
    expect(feeModule).toMatch(/DEFAULT_EXTRA_VENDOR_FEE_KES = 50/);
  });
});

describe("the pure module stays pure", () => {
  it("imports nothing from convex, _generated, or the data layer", () => {
    // The whole reason it is testable, and the reason the same function can
    // price a basket on the server and preview one on the client.
    expect(feeModule).not.toMatch(/from "\.\.\/_generated/);
    expect(feeModule).not.toMatch(/from "convex\//);
    expect(feeModule).not.toMatch(/from "\.\.\/data\//);
  });

  it("does not read the clock", () => {
    // House rule for lib/: time is a parameter, never ambient. Nothing about a
    // delivery fee depends on the clock, so this should stay true.
    expect(feeCode).not.toMatch(/Date\.now\(\)/);
    expect(feeCode).not.toMatch(/new Date\(/);
  });

  it("does not log — that belongs to the ctx-bound wrapper", () => {
    expect(feeCode).not.toMatch(/console\./);
    // And the wrapper does, so a fallback is visible as an ops condition.
    expect(settings).toMatch(/\[delivery_pricing\]/);
  });
});

describe("the basket reads its money from the shared calculation", () => {
  it("getMyTotals exists and is auth-derived", () => {
    const match = cart.match(
      /export const getMyTotals = query\(\{([\s\S]*?)\n\}\);/,
    );
    expect(match).not.toBeNull();
    const body = match![1]!;

    // No actor argument — same rule as the rest of the shop-facing cart API.
    expect(body).toMatch(/args: \{\}/);
    expect(body).toMatch(/callerUser\(ctx\)/);
    // One settings read, one pricing call.
    expect(body).toMatch(/readDeliveryPricing\(ctx\)/);
    expect(body).toMatch(/priceBasketDelivery\(/);
  });

  it("excludes unsellable lines from the threshold", () => {
    const body = cart.match(
      /export const getMyTotals = query\(\{([\s\S]*?)\n\}\);/,
    )![1]!;
    // An out-of-stock line must not earn delivery weight or tip a basket over
    // the free-delivery threshold.
    expect(body).toMatch(/status === "Active" && product\.quantity > 0/);
    expect(body).toMatch(/unavailableCount/);
  });

  it("prices from current product rows, not from the client", () => {
    const body = cart.match(
      /export const getMyTotals = query\(\{([\s\S]*?)\n\}\);/,
    )![1]!;
    expect(body).toMatch(/ctx\.db\.get\(line\.product\)/);
    expect(body).toMatch(/product\.price \* line\.quantity/);
  });
});

describe("getCartSummary is marked as superseded", () => {
  it("carries a @deprecated notice", () => {
    const index = cart.indexOf("export const getCartSummary = ");
    expect(index).toBeGreaterThan(-1);
    expect(cart.slice(Math.max(0, index - 900), index)).toMatch(/@deprecated/);
  });
});
