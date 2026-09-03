import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The first slice of a wider audit: 24 of 30 `data/*` modules imported no auth
 * helper at all, once the payment path (`payment-auth-api.test.ts`) and the
 * catalogue path (`catalogue-mutation-guards.test.ts`) are set aside.
 *
 * This slice closes the money and document surfaces: `insights.ts`
 * (full-platform revenue and PII, no scoping, no caller), `transactions.ts`
 * and `order_items.ts` (wired live into admin with zero auth), `files.ts`
 * (rider documents readable/overwritable by anyone holding a user id), and
 * `stock_reservation.ts` (five mutations keyed on a client-suppliable
 * `orderReference` string with no ownership check — a caller who could guess
 * one could release or fulfil another customer's reserved stock directly).
 *
 * Source-scanning, per the house pattern in `payment-auth-api.test.ts` and
 * `order-mutation-guards.test.ts`: every one of these compiles and type-checks
 * and looks entirely ordinary at the call site. A `mutation` and an
 * `internalMutation` differ by nine characters.
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

const insights = stripComments(read("data", "insights.ts"));
const transactions = stripComments(read("data", "transactions.ts"));
const orderItems = stripComments(read("data", "order_items.ts"));
const files = stripComments(read("data", "files.ts"));
const stockReservation = stripComments(read("data", "stock_reservation.ts"));
const orders = stripComments(read("data", "orders.ts"));
const payments = stripComments(read("data", "payments.ts"));
const paymentFinalization = stripComments(
  read("data", "payment_finalization.ts"),
);

describe("insights.ts — dead, unscoped, now internal", () => {
  const names = [
    "getSalesAnalytics",
    "getRiderPerformance",
    "getProductPerformance",
    "getOrderStatusDistribution",
    "getVendorBreakdown",
    "getGrowthRate",
    "getGrowthMetrics",
    "getRevenueByCategory",
    "getTotalBlinkRevenue",
    "getOrdersSummary",
    "getDetailedOrdersInsights",
    "getDetailedShipmentsInsights",
    "getDetailedProductsInsights",
    "getDetailedUsersInsights",
    "getDetailedIndustriesInsights",
  ];

  it("not one of the fifteen is public", () => {
    for (const name of names) {
      expect(insights, name).toMatch(
        new RegExp(`export const ${name} = internalQuery\\(`),
      );
      expect(insights, name).not.toMatch(
        new RegExp(`export const ${name} = query\\(`),
      );
    }
  });

  it("the vendor-scoped modules — the live ones — are untouched", () => {
    // insights_dashboard.ts and insights_domain.ts already call resolveScope()
    // -> getAuthUser on every export. This slice did not need to touch them;
    // confirming that here guards against a future edit conflating the two.
    const dashboard = read("data", "insights_dashboard.ts");
    const domain = read("data", "insights_domain.ts");
    for (const source of [dashboard, domain]) {
      expect(source).toMatch(/resolveScope\(ctx\)/);
    }
  });
});

describe("transactions.ts", () => {
  it("both reads and the status write are permission-gated", () => {
    expect(fnBody(transactions, "getTransactions")).toMatch(
      /assertPermission\(ctx, "transactions:READ"\)/,
    );
    expect(fnBody(transactions, "getTransaction")).toMatch(
      /assertPermission\(ctx, "transactions:READ"\)/,
    );
    expect(fnBody(transactions, "updateTransactionStatus")).toMatch(
      /assertPermission\(ctx, "transactions:UPDATE"\)/,
    );
  });

  it("the gate runs before any read reaches the database", () => {
    for (const name of ["getTransactions", "getTransaction", "updateTransactionStatus"]) {
      const body = fnBody(transactions, name);
      expect(body.indexOf("assertPermission")).toBeLessThan(
        body.indexOf("ctx.db"),
      );
    }
  });

  it("the state machine — refunded is still terminal — survived the gate", () => {
    // The fix is additive; the transition rules are not this test's concern
    // beyond confirming they were not accidentally deleted alongside it.
    expect(transactions).toMatch(/refunded: \[\]/);
  });

  it("the unused backfill is internal", () => {
    expect(transactions).toMatch(
      /export const backfillTransactionsSearchText = internalMutation\(/,
    );
  });
});

describe("order_items.ts", () => {
  it("listByOrder is gated; the rest are internal", () => {
    expect(fnBody(orderItems, "listByOrder")).toMatch(
      /assertPermission\(ctx, "orders:READ"\)/,
    );
    for (const name of [
      "createItem",
      "updateItem",
      "deleteItem",
      "createOrderWithItems",
    ]) {
      expect(orderItems, name).toMatch(
        new RegExp(`export const ${name} = internalMutation\\(`),
      );
    }
  });

  it("createOrderWithItems writes prices straight from its args — the reason it stays internal", () => {
    // Recorded so nobody re-publishes it believing it is merely unused.
    const body = fnBody(orderItems, "createOrderWithItems");
    expect(body).toMatch(/ctx\.db\.insert\("orders", args\.order\)/);
  });
});

describe("files.ts", () => {
  it("generateUploadUrl requires a signed-in caller, not a staff permission", () => {
    // Gating on assertPermission would break the customer-facing prescription
    // upload flow, which is the point of the softer check.
    const body = fnBody(files, "generateUploadUrl");
    expect(body).toMatch(/getAuthUser\(ctx\)/);
    expect(body).not.toMatch(/assertPermission/);
  });

  it("getImageUrl stays open — it resolves already-public content", () => {
    expect(files).toMatch(/export const getImageUrl = query\(/);
  });

  it("every rider-document function is internal", () => {
    for (const [name, kind] of [
      ["uploadUserIdDocument", "internalMutation"],
      ["uploadUserLicenseDocument", "internalMutation"],
      ["getUserDocuments", "internalQuery"],
      ["deleteDocument", "internalMutation"],
    ] as const) {
      expect(files, name).toMatch(
        new RegExp(`export const ${name} = ${kind}\\(`),
      );
      expect(files, name).not.toMatch(
        new RegExp(`export const ${name} = (?:mutation|query)\\(`),
      );
    }
  });

  it("they took an arbitrary userId with no ownership check — recorded, not silently fixed", () => {
    const body = fnBody(files, "uploadUserIdDocument");
    expect(body).toMatch(/userId: v\.id\("users"\)/);
  });
});

describe("stock_reservation.ts is internal plumbing, in fact and not only in name", () => {
  const internalNow: [string, string][] = [
    ["checkCartStockAvailability", "internalQuery"],
    ["reserveStock", "internalMutation"],
    ["confirmPaymentReservation", "internalMutation"],
    ["fulfillStock", "internalMutation"],
    ["releaseStock", "internalMutation"],
    ["getAvailableStock", "internalQuery"],
    ["batchReserveStock", "internalMutation"],
  ];

  for (const [name, kind] of internalNow) {
    it(`${name} is ${kind}`, () => {
      expect(stockReservation, name).toMatch(
        new RegExp(`export const ${name} = ${kind}\\(`),
      );
      expect(stockReservation, name).not.toMatch(
        new RegExp(`export const ${name} = (?:mutation|query)\\(`),
      );
    });
  }

  it("keyed on a bare orderReference string with no ownership check — the reason this had to close", () => {
    const body = fnBody(stockReservation, "releaseStock");
    expect(body).toMatch(/orderReference: v\.string\(\)/);
    expect(body).not.toMatch(/getAuthUser|user_id/);
  });

  it("every cross-module call reaches it through internal, never through api", () => {
    for (const source of [orders, payments, paymentFinalization, stockReservation]) {
      expect(source).not.toMatch(/api\.data\.stock_reservation\./);
    }
    // And that the calls still exist, just retargeted.
    expect(orders).toMatch(/internal\.data\.stock_reservation\.fulfillStock/);
    expect(orders).toMatch(/internal\.data\.stock_reservation\.releaseStock/);
    expect(payments).toMatch(/internal\.data\.stock_reservation\.reserveStock/);
    expect(payments).toMatch(/internal\.data\.stock_reservation\.releaseStock/);
    expect(paymentFinalization).toMatch(
      /internal\.data\.stock_reservation\.confirmPaymentReservation/,
    );
  });
});
