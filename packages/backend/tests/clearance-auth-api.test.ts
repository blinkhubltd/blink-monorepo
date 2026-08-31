import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The clearance basket and its checkout.
 *
 * All five `clearance_cart` functions took `user_id: v.id("users")` as an
 * argument and were public, so any caller could read, fill, edit or empty
 * another customer's clearance basket. `orders.createClearanceOrder` had no auth
 * and accepted a whole client-built order including its prices.
 *
 * That creator had a structural defect on top of the pricing one: it computed
 * the delivery fee from the number of DISTINCT vendors in the basket and then
 * wrote a SINGLE order attributed to one `vendor_id` — so a two-shop clearance
 * basket became one order that one shop was expected to fulfil in full, at a fee
 * calculated for two.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const cart = read("data", "clearance_cart.ts");
const checkout = read("data", "clearance_checkout.ts");
const orders = read("data", "orders.ts");
const quote = read("lib", "checkout_quote.ts");

function argsOf(body: string): string {
  const start = body.indexOf("args:");
  if (start === -1) return "";
  const open = body.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  return "";
}

function fnBody(source: string, name: string): string {
  const pattern = new RegExp(
    `export const ${name} = (?:mutation|query|internalMutation|internalQuery)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

const CART_MINE = [
  "getMyClearanceCart",
  "setMyClearanceLine",
  "clearMyClearanceCart",
] as const;

const CHECKOUT_MINE = [
  "quoteMyClearanceBasket",
  "beginClearanceCheckout",
  "placeMyClearanceOrder",
] as const;

describe("the clearance basket", () => {
  it("has an auth-derived surface", () => {
    for (const name of CART_MINE) {
      expect(cart).toMatch(
        new RegExp(`export const ${name} = (?:mutation|query)\\(`),
      );
    }
  });

  it("is told nothing about who is calling", () => {
    for (const name of CART_MINE) {
      expect(argsOf(fnBody(cart, name)), name).not.toMatch(
        /user_id|userId|clerkId|clerk_id/,
      );
    }
  });

  it("sets quantities absolutely, not as deltas", () => {
    const body = fnBody(cart, "setMyClearanceLine");
    // `addToCart` added to whatever was there, so a screen sending the quantity
    // it displays turned a line of 5 into 10 — the double-count the regular
    // basket had, in the same shape.
    expect(body).toMatch(/quantity: v\.number\(\)/);
    expect(body).not.toMatch(/\+ *existing\.quantity|quantity \+=/);
  });

  it("validates the listing on write, not just on read", () => {
    const body = fnBody(cart, "setMyClearanceLine");
    expect(body).toMatch(/product\.status !== "Active"/);
    expect(body).toMatch(/product\.display_end_date <= now/);
    expect(body).toMatch(/product\.quantity <= 0/);
  });

  it("keeps unsellable lines visible with a reason", () => {
    // Silently dropping an item the customer chose reads as the app losing it.
    expect(fnBody(cart, "getMyClearanceCart")).toMatch(/unavailableReason/);
  });
});

describe("the clearance checkout", () => {
  it("is auth-derived throughout", () => {
    for (const name of CHECKOUT_MINE) {
      expect(argsOf(fnBody(checkout, name)), name).not.toMatch(
        /user_id|userId|clerkId/,
      );
    }
    for (const name of ["beginClearanceCheckout", "placeMyClearanceOrder"]) {
      expect(fnBody(checkout, name), name).toMatch(/getAuthUser\(ctx\)/);
    }
  });

  it("accepts no price from the client except one to compare against", () => {
    const args = argsOf(fnBody(checkout, "beginClearanceCheckout"));
    expect(args).toMatch(/expectedTotal: v\.optional/);
    expect(args).not.toMatch(/delivery_fee|total_amount|subtotal/);

    const placeArgs = argsOf(fnBody(checkout, "placeMyClearanceOrder"));
    expect(placeArgs).not.toMatch(/amount|fee|price|total/);
  });

  it("writes one order per vendor", () => {
    const body = fnBody(checkout, "placeMyClearanceOrder");
    expect(body).toMatch(/for \(const leg of quote\.legs\)/);
    expect(body).toMatch(/is_clearance: true/);
  });

  it("replays the stored quote rather than re-pricing", () => {
    const body = fnBody(checkout, "placeMyClearanceOrder");
    expect(body).toMatch(/payment\.quote/);
    expect(body).not.toMatch(/buildClearanceQuote/);
  });

  it("refuses a quote that is not a clearance quote", () => {
    // Otherwise a regular basket's quote would be written into
    // `clearance_order_items` with invented discount fields.
    expect(fnBody(checkout, "placeMyClearanceOrder")).toMatch(
      /!quote\.isClearance/,
    );
  });

  it("validates each id against the clearance table", () => {
    expect(fnBody(checkout, "placeMyClearanceOrder")).toMatch(
      /normalizeId\(\s*"clearance_products"/,
    );
  });

  it("is idempotent on the reference, in both mutations", () => {
    expect(fnBody(checkout, "beginClearanceCheckout")).toMatch(
      /by_reference/,
    );
    expect(fnBody(checkout, "placeMyClearanceOrder")).toMatch(
      /by_payment_reference/,
    );
  });
});

describe("the free-delivery waiver cannot reach clearance", () => {
  it("buildClearanceQuote takes settings with no threshold field", () => {
    const signature = quote.slice(
      quote.indexOf("export function buildClearanceQuote("),
      quote.indexOf("): CheckoutQuote {", quote.indexOf("buildClearanceQuote(")),
    );
    expect(signature).toMatch(/baseFee: number; extraVendorFee: number/);
    expect(signature).not.toMatch(/freeThreshold/);
  });

  it("and never calls the regular pricer", () => {
    const body = quote.slice(
      quote.indexOf("export function buildClearanceQuote("),
      quote.indexOf("export function assertQuoteBalances"),
    );
    expect(body).toMatch(/priceClearanceDelivery\(/);
    expect(body).not.toMatch(/priceBasketDelivery\(/);
    expect(body).not.toMatch(/qualifiesForFreeDelivery/);
  });
});

describe("the legacy creator", () => {
  it("is internal", () => {
    expect(orders).toMatch(
      /export const createClearanceOrder = internalMutation\(/,
    );
    expect(orders).not.toMatch(
      /export const createClearanceOrder = mutation\(/,
    );
  });
});
