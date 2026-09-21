import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The admin order details page, and the query it replaced.
 *
 * `getOrderWithItems` was a public query with no auth: any caller holding an
 * order id got the customer's name, email and phone. The admin "View details"
 * action fetched it for a dialog that was never rendered. The page that
 * replaces that dialog reads `getOrderDetails` instead, and
 * `getOrderWithItems` is internal — its only callers are server-side.
 *
 * Source-scanning, like the other guard tests here, because an unguarded query
 * compiles, type-checks and works perfectly.
 */

// Normalised: orders.ts is CRLF on some checkouts, and the body regex below
// anchors on a bare newline before the closing `});`.
const orders = readFileSync(
  join(__dirname, "..", "convex", "data", "orders.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const notifications = readFileSync(
  join(__dirname, "..", "convex", "data", "notifications.ts"),
  "utf8",
);

function body(name: string): string {
  const match = orders.match(
    new RegExp(
      `export const ${name} = (?:query|internalQuery)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
    ),
  );
  return match?.[1] ?? "";
}

describe("getOrderDetails", () => {
  const details = body("getOrderDetails");

  it("is a public query, gated on orders:READ before any read", () => {
    expect(orders).toMatch(/export const getOrderDetails = query\(/);
    const gate = details.indexOf('assertPermission(ctx, "orders:READ")');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(details.indexOf("ctx.db.get(args.orderId)"));
  });

  it("enforces a hub manager's vendor scope on the server", () => {
    // In the list, the scope is a filter the browser sends. Here it is checked.
    expect(details).toMatch(/manager_details\?\.vendor_id/);
    expect(details).toMatch(/scopedVendorIds\.includes\(order\.vendor_id\)/);
    // Out of scope answers exactly like a missing order.
    expect(details).toMatch(/return null;/);
  });

  it("never returns the delivery code", () => {
    expect(details).toMatch(
      /const \{ delivery_code, idempotency_key, \.\.\.safeOrder \} = order;/,
    );
    expect(details).toMatch(/\.\.\.safeOrder/);
    expect(details).not.toMatch(/\.\.\.order\b/);
  });
});

describe("getOrderWithItems", () => {
  it("is internal, so the client cannot read customer contact details", () => {
    expect(orders).toMatch(/export const getOrderWithItems = internalQuery\(/);
    expect(orders).not.toMatch(/export const getOrderWithItems = query\(/);
  });

  it("its server-side callers use the internal reference", () => {
    expect(notifications).not.toMatch(/api\.data\.orders\.getOrderWithItems/);
    expect(notifications).toMatch(/internal\.data\.orders\.getOrderWithItems/);
  });
});
