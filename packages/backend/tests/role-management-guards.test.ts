import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `createRole`, `updateRole` and `deleteRole` in `user/roles.ts` had no
 * authorization at all — the sweep behind `role-mutation-guards.test.ts` only
 * looked at functions that write `role_id`, and missed the ones that rewrite
 * what a role *is*. Any caller could `updateRole` the Customer role to hold
 * `"*"`, which is strictly worse than assigning a role.
 *
 * Also asserted: the guard must not be `assertPermission`, because that
 * helper's system-role bypass (`isAllowed`) waves Customer/Rider/Picker through
 * every check — a signed-in customer would still pass.
 */

const source = readFileSync(
  join(__dirname, "..", "convex", "user", "roles.ts"),
  "utf8",
);

function body(name: string): string {
  const match = source.match(
    new RegExp(`export const ${name} = mutation\\(\\{[\\s\\S]*?\\n\\}\\);`),
  );
  expect(match, `${name} should exist as a public mutation`).not.toBeNull();
  return match![0];
}

describe("user/roles.ts mutation guards", () => {
  const expected = {
    createRole: "roles:CREATE",
    updateRole: "roles:UPDATE",
    deleteRole: "roles:DELETE",
  } as const;

  for (const [name, permission] of Object.entries(expected)) {
    it(`${name} requires ${permission}`, () => {
      expect(body(name)).toContain(`assertRoleAdmin(ctx, "${permission}")`);
    });
  }

  it("does not gate on assertPermission (system-role bypass)", () => {
    for (const name of Object.keys(expected)) {
      expect(body(name)).not.toMatch(/assertPermission/);
    }
  });

  it("assertRoleAdmin authenticates and rejects system roles", () => {
    const guard = source.match(
      /async function assertRoleAdmin[\s\S]*?\n\}\n/,
    )?.[0];
    expect(guard).toBeDefined();
    expect(guard).toContain("getAuthUser(ctx)");
    expect(guard).toContain("isSystemRoleName(authed.roleName)");
    expect(guard).toContain("listHasPermission(authed.permissions");
  });

  it("guards the wildcard on create, update and delete", () => {
    expect(body("createRole")).toMatch(
      /assertMayTouchWildcard\(caller, args\.permissions\)/,
    );
    // Update checks both the stored role and the incoming list.
    expect(body("updateRole")).toMatch(
      /assertMayTouchWildcard\(caller, role\.permissions, args\.permissions\)/,
    );
    expect(body("deleteRole")).toMatch(
      /assertMayTouchWildcard\(caller, role\.permissions\)/,
    );
  });

  it("wildcard guard defers to isSuperAdminPermissions on the caller", () => {
    const guard = source.match(
      /function assertMayTouchWildcard[\s\S]*?\n\}\n/,
    )?.[0];
    expect(guard).toContain("isSuperAdminPermissions(caller.permissions)");
  });

  it("validates permission strings on create and update", () => {
    expect(body("createRole")).toContain("assertWellFormed(args.permissions)");
    expect(body("updateRole")).toContain("assertWellFormed(args.permissions)");
  });

  it("runs the auth check before any database access", () => {
    for (const name of Object.keys(expected)) {
      const b = body(name);
      expect(b.indexOf("assertRoleAdmin")).toBeGreaterThan(-1);
      expect(b.indexOf("assertRoleAdmin")).toBeLessThan(b.indexOf("ctx.db"));
    }
  });
});
