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
  return readFileSync(join(CONVEX, ...parts), "utf8")
    .split("\r\n")
    .join("\n");
}

const cart = read("data", "clearance_cart.ts");
const checkout = read("data", "clearance_checkout.ts");
const orderWrite = read("data", "order_write.ts");
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
    expect(fnBody(checkout, "beginClearanceCheckout")).toMatch(
      /getAuthUser\(ctx\)/,
    );
  });

  it("accepts no price from the client except one to compare against", () => {
    const args = argsOf(fnBody(checkout, "beginClearanceCheckout"));
    expect(args).toMatch(/expectedTotal: v\.optional/);
    expect(args).not.toMatch(/delivery_fee|total_amount|subtotal/);
  });

  it("is idempotent on the reference", () => {
    expect(fnBody(checkout, "beginClearanceCheckout")).toMatch(/by_reference/);
  });
});

describe("clearance is paid up front, and cannot be otherwise", () => {
  /*
    Pay-on-delivery is gone from clearance entirely.

    Clearance stock is finite, per-listing and short-dated, and the lines are
    already discounted. A refusal at the door writes off inventory that was held
    out of the catalogue for the duration of the delivery, with no second unit
    behind it.

    The enforcement is a type, not a check: `paymentMode` is a single literal, so
    the alternative is unrepresentable rather than rejected at runtime.
  */
  it("paymentMode admits only pay_now", () => {
    const args = argsOf(fnBody(checkout, "beginClearanceCheckout"));
    expect(args).toMatch(/paymentMode: v\.literal\("pay_now"\)/);
    expect(args).not.toMatch(/pay_on_delivery/);
  });

  it("the payment row is never written as cash", () => {
    const body = fnBody(checkout, "beginClearanceCheckout");
    expect(body).toMatch(/payment_method: "Card"/);
    expect(body).not.toMatch(/Cash on Delivery/);
  });

  it("fulfilment is required, not optional", () => {
    // Every clearance checkout is a card checkout, and a card checkout that
    // cannot be settled without the client returning is the failure the stored
    // address exists to prevent.
    const args = argsOf(fnBody(checkout, "beginClearanceCheckout"));
    expect(args).toMatch(/fulfilment: v\.object\(clearanceFulfilmentArgs\)/);
    expect(args).not.toMatch(/fulfilment: v\.optional/);
  });

  it("placeMyClearanceOrder is gone", () => {
    // It existed only to write pay-on-delivery clearance orders.
    expect(checkout).not.toMatch(/export const placeMyClearanceOrder/);
  });

  it("and the reason it is gone is recorded where it used to be", () => {
    // So the next person does not conclude it was lost in a refactor.
    expect(checkout).toMatch(/`placeMyClearanceOrder` was here/);
  });
});

describe("clearance settlement goes through the shared writer", () => {
  /*
    The guarantees that used to be asserted against `placeMyClearanceOrder` now
    belong to `data/order_write.ts`, which both baskets share — so they cannot
    drift apart, which two near-identical copies certainly would.

    `payment-auth-api.test.ts` covers the writer's idempotency and its
    quote-replaying. What matters here is that the clearance-specific rules
    survived the move.
  */
  it("one order per vendor leg, each flagged as clearance", () => {
    expect(orderWrite).toMatch(/for \(const leg of quote\.legs\)/);
    expect(orderWrite).toMatch(/is_clearance: isClearance \? true : undefined/);
  });

  it("the clearance branch is chosen by the quote, not by an argument", () => {
    // A caller-supplied flag could write a catalogue basket into
    // `clearance_order_items` with invented discount fields.
    expect(orderWrite).toMatch(
      /const isClearance = quote\.isClearance === true/,
    );
  });

  it("each id is validated against the clearance table", () => {
    expect(orderWrite).toMatch(/normalizeId\(\s*"clearance_products",/);
    expect(orderWrite).toMatch(/mixes catalogue items into a clearance basket/);
  });

  it("the discount is written as quoted, not re-read from the listing", () => {
    // A listing edited after the sale must not rewrite a receipt the customer
    // already holds.
    expect(orderWrite).toMatch(
      /original_price: item\.originalPrice \?\? item\.unitPrice/,
    );
    expect(orderWrite).toMatch(/clearance_price: item\.unitPrice/);
  });

  it("stock is still decremented through the internal mutation", () => {
    // Clearance stock is finite and per-listing, and that mutation is where the
    // decrement rule lives.
    expect(orderWrite).toMatch(
      /internal\.data\.clearance_products\.decrementStock/,
    );
  });

  it("the clearance basket is the one emptied for a clearance order", () => {
    expect(orderWrite).toMatch(/\.query\("clearance_cart"\)/);
  });
});

describe("the free-delivery waiver cannot reach clearance", () => {
  it("buildClearanceQuote takes settings with no threshold field", () => {
    const signature = quote.slice(
      quote.indexOf("export function buildClearanceQuote("),
      quote.indexOf(
        "): CheckoutQuote {",
        quote.indexOf("buildClearanceQuote("),
      ),
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
