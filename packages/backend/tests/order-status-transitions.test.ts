import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where the order-track rules are enforced, and where they deliberately are not.
 *
 * The rules themselves are unit-tested in `packages/lib`
 * (`order-transitions.test.ts`). This pins the wiring: a manual change is
 * checked before it is written, bulk is all-or-nothing, and delivery-code
 * verification goes straight to the writer — proof at the door outranks
 * bookkeeping.
 */

const orders = readFileSync(
  join(__dirname, "..", "convex", "data", "orders.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

function body(name: string): string {
  const match = orders.match(
    new RegExp(
      `export const ${name} = (?:mutation|internalMutation)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
    ),
  );
  return match?.[1] ?? "";
}

describe("updateOrderStatus", () => {
  const update = body("updateOrderStatus");

  it("checks the transition before writing", () => {
    const check = update.indexOf(
      "checkOrderTransition(order.order_status, args.status)",
    );
    const write = update.indexOf("applyOrderStatus(");
    expect(check).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(check);
    expect(update).toMatch(
      /if \(!check\.ok\) throw new ConvexError\(check\.reason\)/,
    );
  });

  it("does not patch the status itself — every write goes through one writer", () => {
    expect(update).not.toMatch(/ctx\.db\.patch/);
  });
});

describe("bulkUpdateOrderStatus", () => {
  const bulk = body("bulkUpdateOrderStatus");

  it("checks every order before writing any", () => {
    const check = bulk.indexOf(
      "checkOrderTransition(order.order_status, status)",
    );
    const firstWrite = bulk.indexOf("ctx.db.patch");
    expect(check).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(check);
  });
});

describe("verifyDeliveryCode", () => {
  const verify = body("verifyDeliveryCode");

  it("marks Delivered through the writer, not the checked mutation", () => {
    expect(verify).toMatch(/applyOrderStatus\(ctx, order, "Delivered"\)/);
    expect(verify).not.toMatch(/api\.data\.orders\.updateOrderStatus/);
  });
});
