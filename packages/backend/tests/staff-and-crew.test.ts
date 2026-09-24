import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two properties of the Staff page's backend, checked from source like this
 * directory's other guards:
 *
 *  1. `getAllStaff` defines staff by ROLE (anything but Customer). It used to
 *     read the `isStaff` boolean alone, which nothing ever writes — so the
 *     page was empty on every deployment no matter who held what role.
 *  2. `updateRiderDetails` / `updatePickerDetails` MERGE into the existing
 *     details object. A plain replace — what `assignRiderWithDetails` does,
 *     correctly, for a brand-new rider — would drop the rider's rating,
 *     location and ID/licence images on every edit.
 */

const source = readFileSync(
  join(__dirname, "..", "convex", "user", "users.ts"),
  "utf8",
);

function body(name: string, kind = "query|mutation"): string {
  const match = source.match(
    new RegExp(`export const ${name} = (?:${kind})\\(\\{[\\s\\S]*?\\n\\}\\);`),
  );
  expect(match, `${name} should exist`).not.toBeNull();
  return match![0];
}

describe("getAllStaff", () => {
  it("lists by role, excluding Customer, not by the isStaff flag alone", () => {
    const b = body("getAllStaff");
    expect(b).toMatch(/withIndex\("by_role_id"/);
    expect(b).toMatch(/!== "customer"/);
  });

  it("is still gated", () => {
    expect(body("getAllStaff")).toMatch(/assertStaffOrPermission\(/);
  });
});

describe("rider and picker detail edits", () => {
  // `assertStaffPermission`, not `assertPermission`: the latter lets every
  // rider and picker through (system-role bypass), so a rider could rewrite
  // their own vendor.
  it("updateRiderDetails merges into rider_details and is staff-only", () => {
    const b = body("updateRiderDetails");
    expect(b).toMatch(/\.\.\.user\.rider_details/);
    expect(b).toMatch(/assertStaffPermission\(ctx, "users:UPDATE"\)/);
    // Status is the rider's online switch; approval is separate.
    expect(b).not.toMatch(/status: args\.status/);
  });

  it("updatePickerDetails merges into picker_details and is staff-only", () => {
    const b = body("updatePickerDetails");
    expect(b).toMatch(/\.\.\.user\.picker_details/);
    expect(b).toMatch(/assertStaffPermission\(ctx, "users:UPDATE"\)/);
  });
});
