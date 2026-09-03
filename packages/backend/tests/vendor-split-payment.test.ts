import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Vendor split payments, wired to the stored quote instead of live re-pricing.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * `preparePaystackSplitForCheckout` had zero callers in any app, and its own
 * doc comment said so. It re-derived vendor weights and the delivery fee from
 * live product prices and `payment.amount - itemsTotal` — the same shape of
 * bug the checkout rewrite closed everywhere else: a figure recomputed after
 * the fact can disagree with the one actually charged.
 *
 * `prepareMyPaymentSplit` reads the split straight from `payment.quote.legs`,
 * computed once by `checkout.beginCheckout` and never re-derived — see
 * `lib/vendor_split.ts` and its own tests for the arithmetic.
 *
 * ── Why the two subaccount writes had to move to internal ─────────────────
 *
 * This action is called by an authenticated CUSTOMER, mid-checkout, via
 * `ctx.runMutation`/`ctx.runQuery` — which preserves the caller's identity.
 * The old handler wrote through `api.data.vendors.setVendorPaystackSubaccountCode`
 * and `api.data.industry.updateIndustry`, the second of which now requires
 * `assertPermission(ctx, "industries:UPDATE")` (closed in the authorization
 * sweep) — a permission no customer holds. Giving this action a real caller
 * would have made every first-time split throw "Forbidden" the moment it
 * tried to persist a newly created subaccount code. Both writes now go through
 * internal-only mutations scoped to exactly the field this flow touches.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fnBody(source: string, name: string): string {
  const pattern = new RegExp(
    `export const ${name} = (?:mutation|query|action|internalMutation|internalQuery|internalAction)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

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

const split = stripComments(read("data", "payment_split.ts"));
const industry = stripComments(read("data", "industry.ts"));
const vendors = stripComments(read("data", "vendors.ts"));
const payments = stripComments(read("data", "payments.ts"));

describe("prepareMyPaymentSplit", () => {
  it("takes only a reference — no cart, no client-supplied price", () => {
    const body = fnBody(split, "prepareMyPaymentSplit");
    expect(argsOf(body).replace(/[\s,]/g, "")).toBe("reference:v.string()");
  });

  it("checks ownership before anything else", () => {
    const body = fnBody(split, "prepareMyPaymentSplit");
    const ownership = body.indexOf("assertMyPayment");
    const secretCheck = body.indexOf("PAYSTACK_SECRET_KEY");
    expect(ownership).toBeGreaterThan(-1);
    expect(ownership).toBeLessThan(secretCheck);
  });

  it("refuses a payment with no stored quote, or an empty one", () => {
    const body = fnBody(split, "prepareMyPaymentSplit");
    expect(body).toMatch(/const quote = payment\.quote;/);
    expect(body).toMatch(/if \(!quote\)/);
    expect(body).toMatch(/quote\.legs\.length === 0/);
  });

  it("reads vendor amounts from the quote's legs, never from live products", () => {
    const body = fnBody(split, "prepareMyPaymentSplit");
    expect(body).toMatch(/quote\.legs/);
    // The bug being fixed: re-fetching a product's current price mid-checkout.
    expect(split).not.toMatch(/getProductsById/);
    expect(split).not.toMatch(/cartItems/);
  });

  it("computes the split through the pure, tested module", () => {
    const body = fnBody(split, "prepareMyPaymentSplit");
    expect(body).toMatch(/computeVendorSplit\(/);
  });

  it("reuses an existing split_code rather than recomputing", () => {
    const body = fnBody(split, "prepareMyPaymentSplit");
    expect(body).toMatch(/payment\.paystack_split_code/);
    expect(body).toMatch(/reused: true/);
  });
});

describe("the subaccount writes this flow triggers are internal", () => {
  it("vendors.setVendorPaystackSubaccountCode is internal", () => {
    expect(vendors).toMatch(
      /export const setVendorPaystackSubaccountCode = internalMutation\(/,
    );
    expect(vendors).not.toMatch(
      /export const setVendorPaystackSubaccountCode = mutation\(/,
    );
  });

  it("industry.setIndustryPaystackSubaccountCode is internal and scoped", () => {
    expect(industry).toMatch(
      /export const setIndustryPaystackSubaccountCode = internalMutation\(/,
    );
    // Touches only the subaccount code, not the admin-entered fields.
    const body = fnBody(industry, "setIndustryPaystackSubaccountCode");
    expect(argsOf(body)).not.toMatch(/business_name|bank_code|account_number/);
  });

  it("payment_split.ts reaches both through internal, never through api", () => {
    expect(split).toMatch(
      /internal\.data\.vendors\.setVendorPaystackSubaccountCode/,
    );
    expect(split).toMatch(
      /internal\.data\.industry\.setIndustryPaystackSubaccountCode/,
    );
    expect(split).not.toMatch(/api\.data\.vendors\.setVendorPaystackSubaccountCode/);
    expect(split).not.toMatch(/api\.data\.industry\.updateIndustry/);
  });

  it("the customer-facing action never touches industries:UPDATE", () => {
    // If it did, the very first customer to trigger a new industry subaccount
    // would hit "Forbidden: missing permission" mid-checkout.
    expect(split).not.toMatch(/industries:UPDATE/);
  });
});

describe("the payment lookup this flow needs no longer leaks", () => {
  it("payments.getPaymentByReference is internal", () => {
    expect(payments).toMatch(
      /export const getPaymentByReference = internalQuery\(/,
    );
    expect(payments).not.toMatch(
      /export const getPaymentByReference = query\(/,
    );
  });

  it("it held customerEmail and the stored delivery address with no guard at all — the reason it closed", () => {
    // Recorded so a future re-publish is a deliberate act, not a rediscovery.
    const body = fnBody(payments, "getPaymentByReference");
    expect(body).toMatch(/by_reference/);
  });
});
