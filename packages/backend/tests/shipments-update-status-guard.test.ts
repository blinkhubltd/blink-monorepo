import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `shipments.updateStatus` (called only from apps/admin's ShipmentsTable) took
 * no permission at all: any signed-in user — including a rider or picker, who
 * hold zero dashboard permissions but are still signed-in users — could set
 * any shipment to any status, `Delivered` included, with no gate to stop it.
 * `startMyRide` exists precisely because a rider must not have that power
 * over their own delivery; this mutation gave it to them over every delivery.
 *
 * Gated with `shipments:UPDATE`, matching the `orders:UPDATE` pattern the
 * sibling admin mutations in `orders.ts` already use — `shipments` is one of
 * `RESOURCES` in `lib/permissions.ts` and has its own dashboard route, so this
 * is an existing permission, not a new one nothing can hold.
 */

const source = readFileSync(
  join(__dirname, "..", "convex", "data", "shipments.ts"),
  "utf8",
).split("\r\n").join("\n");

function fnBody(name: string): string {
  const pattern = new RegExp(
    `export const ${name} = mutation\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

describe("shipments.updateStatus", () => {
  it("requires shipments:UPDATE", () => {
    expect(fnBody("updateStatus")).toMatch(
      /assertPermission\(ctx, "shipments:UPDATE"\)/,
    );
  });

  it("checks the permission before touching the database", () => {
    const body = fnBody("updateStatus");
    expect(body.indexOf("assertPermission")).toBeGreaterThan(-1);
    expect(body.indexOf("assertPermission")).toBeLessThan(
      body.indexOf("ctx.db"),
    );
  });
});
