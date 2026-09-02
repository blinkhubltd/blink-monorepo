import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The payment write surface.
 *
 * ── What this was written for ────────────────────────────────────────────
 *
 * Order finalisation was authenticated and priced from a stored quote, and none
 * of that mattered, because the field it all keyed on was world-writable.
 *
 * `payments.applyVerificationResult` was a public mutation taking
 * `successful: v.boolean()` — the caller supplied the verdict. `updatePaymentStatus`
 * was public with no auth at all and took the status directly. Both write
 * `payments.status`, and the finalisers' only money check is
 * `payment.status === "Successful"`.
 *
 * So the exploit needed no cleverness: begin a real checkout, mark your own
 * reference Successful, finalise. Real orders, real delivery, nothing paid. A
 * card flow shipped on top of that surface would have been decorative.
 *
 * The rule now: **a client may ask the server to ask Paystack. It may never
 * state the answer.** Verification is server-to-server inside `verifyPaystack`,
 * reached only from the signature-checked webhook or from an authenticated
 * action, and it is the only thing that can flip a payment to Successful.
 *
 * Source-scanning, like the cart, catalogue and order guards, because every one
 * of these compiles and type-checks and looks entirely ordinary at the call
 * site. A `mutation` and an `internalMutation` differ by nine characters.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const payments = read("data", "payments.ts");
const split = read("data", "payment_split.ts");
const subaccounts = read("data", "paystack_subaccounts.ts");
const webhook = read("webhooks", "paystack.ts");

/**
 * Comments stripped.
 *
 * Every function closed here now carries a docstring quoting the public
 * declaration it used to have, so a scan for `= mutation(` matches the
 * explanation of the fix. Same trap the delivery-fee wiring and prescription
 * tests hit: an assertion that matches its own documentation passes for the
 * wrong reason, or fails for one.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const paymentsCode = stripComments(payments);
const splitCode = stripComments(split);
const subaccountsCode = stripComments(subaccounts);

/** Brace-matched `args:` block — see the note in cart-auth-api.test.ts. */
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
    `export const ${name} = (?:mutation|query|action|internalMutation|internalQuery|internalAction)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

describe("nothing outside the server can write a payment's verdict", () => {
  it("applyVerificationResult is internal", () => {
    // THE guard. It takes `successful: v.boolean()`, so public it was simply a
    // request to be marked paid.
    expect(paymentsCode).toMatch(
      /export const applyVerificationResult = internalMutation\(/,
    );
    expect(paymentsCode).not.toMatch(
      /export const applyVerificationResult = mutation\(/,
    );
  });

  it("it still takes the verdict as an argument, which is why it must stay internal", () => {
    // Recorded deliberately. If someone ever re-publishes this, the argument
    // shape is the reason not to — not a detail to rediscover.
    expect(argsOf(fnBody(payments, "applyVerificationResult"))).toMatch(
      /successful: v\.boolean\(\)/,
    );
  });

  it("verifyPaystack is internal, and is the only caller", () => {
    expect(paymentsCode).toMatch(
      /export const verifyPaystack = internalAction\(/,
    );
    expect(paymentsCode).not.toMatch(/export const verifyPaystack = action\(/);

    const callers =
      paymentsCode.split("internal.data.payments.applyVerificationResult")
        .length - 1;
    expect(callers).toBe(1);
    // Never through the public api object, which would defeat the point.
    expect(paymentsCode).not.toMatch(
      /api\.data\.payments\.applyVerificationResult/,
    );
  });

  it("verifyPaystack decides from Paystack's own response, not from an argument", () => {
    const body = fnBody(payments, "verifyPaystack");
    // The whole trust boundary in one line.
    expect(body).toMatch(
      /const successful =\s*\n?\s*topLevelStatus === true && paystackStatus === "success";/,
    );
    expect(argsOf(body)).not.toMatch(/successful|status/);
  });

  it("the webhook reaches it internally too", () => {
    expect(webhook).toMatch(
      /internal\.data\.payments\.verifyPaystack, \{ reference \}/,
    );
    expect(webhook).not.toMatch(/api\.data\.payments\.verifyPaystack/);
  });
});

describe("the hand-operated status write", () => {
  it("updatePaymentStatus stays public but is permission-gated", () => {
    // Public on purpose: the admin payments screen is a real reconciliation
    // tool for a charge Paystack and Blink disagree about.
    expect(paymentsCode).toMatch(
      /export const updatePaymentStatus = mutation\(/,
    );
    expect(fnBody(payments, "updatePaymentStatus")).toMatch(
      /assertPermission\(ctx, "payments:UPDATE"\)/,
    );
  });

  it("the gate is the first thing in the handler", () => {
    // A guard after the read is a guard that leaked the read.
    const body = fnBody(payments, "updatePaymentStatus");
    const handler = body.slice(body.indexOf("handler:"));
    expect(handler.indexOf("assertPermission")).toBeLessThan(
      handler.indexOf("ctx.db"),
    );
  });
});

describe("the superseded payment creators are off the public API", () => {
  // Every one of these had zero callers in every app in this monorepo.
  // `blink-ecommerce` calls some of them and runs on its own Convex deployment,
  // so nothing here can break it. Making a public function internal is a
  // breaking change that was safe exactly once.
  const internalNow: [string, string][] = [
    ["createPayment", "internalMutation"],
    ["createPaymentWithStockReservation", "internalMutation"],
    ["persistInitiatedPaystackPayment", "internalMutation"],
    ["initiatePaystackTransactionAction", "internalAction"],
    ["setPaymentSplit", "internalMutation"],
  ];

  for (const [name, kind] of internalNow) {
    it(`${name} is ${kind}`, () => {
      expect(paymentsCode).toMatch(
        new RegExp(`export const ${name} = ${kind}\\(`),
      );
      expect(paymentsCode).not.toMatch(
        new RegExp(`export const ${name} = (?:mutation|action)\\(`),
      );
    });
  }

  it("they are all tagged, so nobody re-publishes one by accident", () => {
    for (const name of [
      "createPayment",
      "createPaymentWithStockReservation",
      "persistInitiatedPaystackPayment",
      "initiatePaystackTransactionAction",
    ]) {
      const declaration = payments.indexOf(`export const ${name} = internal`);
      expect(declaration, name).toBeGreaterThan(-1);
      const preamble = payments.slice(
        Math.max(0, declaration - 900),
        declaration,
      );
      expect(preamble.slice(preamble.lastIndexOf("});")), name).toMatch(
        /@deprecated/,
      );
    }
  });

  it("createPayment still takes a client amount — the reason beginCheckout exists", () => {
    expect(argsOf(fnBody(payments, "createPayment"))).toMatch(
      /amount: v\.float64\(\)/,
    );
  });
});

describe("vendor payout wiring", () => {
  it("paystack_subaccounts.upsert is internal", () => {
    // Public, this let anyone repoint a vendor's payout subaccount — i.e. name
    // the bank account a vendor's share is paid into.
    expect(subaccountsCode).toMatch(
      /export const upsert = internalMutation\(/,
    );
    expect(subaccountsCode).not.toMatch(/export const upsert = mutation\(/);
  });

  it("preparePaystackSplitForCheckout is internal", () => {
    expect(splitCode).toMatch(
      /export const preparePaystackSplitForCheckout = internalAction\(/,
    );
    expect(splitCode).not.toMatch(
      /export const preparePaystackSplitForCheckout = action\(/,
    );
  });

  it("it reaches the writes it needs internally", () => {
    expect(splitCode).toMatch(/internal\.data\.payments\.setPaymentSplit/);
    expect(splitCode).toMatch(
      /internal\.data\.paystack_subaccounts\.upsert/,
    );
  });
});
