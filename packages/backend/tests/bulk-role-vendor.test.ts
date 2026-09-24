import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `bulkAssignRole` used to patch only `role_id`, so bulk-assigning a batch of
 * users as riders or pickers left every one of them with no `vendor_id` —
 * the single-user path (`assignRoleToUser`) got this right from the start.
 * Both now go through the same `vendorScopedUpdates` branch, checked here by
 * source rather than by calling into Convex, matching this file's siblings
 * (`invitation-guards.test.ts`, `role-mutation-guards.test.ts`).
 */

const source = readFileSync(
  join(__dirname, "..", "convex", "user", "users.ts"),
  "utf8",
);

describe("bulkAssignRole applies the same vendor-scoped updates as assignRoleToUser", () => {
  it("both mutations call the shared vendorScopedUpdates helper", () => {
    const bulkMatch = source.match(
      /export const bulkAssignRole = mutation\(\{[\s\S]*?\n\}\);/,
    );
    const singleMatch = source.match(
      /export const assignRoleToUser = mutation\(\{[\s\S]*?\n\}\);/,
    );
    expect(bulkMatch, "bulkAssignRole should exist").not.toBeNull();
    expect(singleMatch, "assignRoleToUser should exist").not.toBeNull();

    expect(bulkMatch![0]).toMatch(/vendorScopedUpdates\(/);
    expect(singleMatch![0]).toMatch(/vendorScopedUpdates\(/);

    // Both take the same vendor-scoped args, spread from one shared object —
    // two separately-typed copies is exactly how they drifted apart before.
    expect(bulkMatch![0]).toMatch(/\.\.\.vendorScopedRoleArgs/);
    expect(singleMatch![0]).toMatch(/\.\.\.vendorScopedRoleArgs/);
  });

  it("vendorScopedUpdates covers rider, picker and every other vendor-managing role", () => {
    const helperMatch = source.match(
      /function vendorScopedUpdates\([\s\S]*?\n\}/,
    );
    expect(helperMatch, "vendorScopedUpdates should exist").not.toBeNull();
    const body = helperMatch![0];

    expect(body).toMatch(/roleLower === "rider"/);
    expect(body).toMatch(/rider_details:/);
    expect(body).toMatch(/roleLower === "picker"/);
    expect(body).toMatch(/picker_details:/);
    expect(body).toMatch(/manager_details:/);
  });

  it("bulkAssignRole still checks the same permission it always did", () => {
    const bulkMatch = source.match(
      /export const bulkAssignRole = mutation\(\{[\s\S]*?\n\}\);/,
    );
    expect(bulkMatch![0]).toMatch(/assertPermission\(ctx, "users:UPDATE"\)/);
  });
});
