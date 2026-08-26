import { describe, expect, it } from "vitest";
import {
  isSuperAdminPermissions,
  rolePresets,
  SUPER_ADMIN_ROLE_NAME,
  validateRolePresets,
  type RolePreset,
} from "../convex/lib/role_presets";
import {
  hasPermission,
  isSystemRoleName,
  WILDCARD_PERMISSION,
} from "@repo/lib/utils";

/**
 * The seeded roles decide who can enter the platform, and they are written once
 * and never re-read. A mistake here is not a bug that gets noticed and fixed —
 * it is a deployment that either locks everyone out or lets everyone in, found
 * out at the worst moment.
 */

describe("role presets", () => {
  it("satisfies its own invariants", () => {
    expect(validateRolePresets()).toEqual([]);
  });

  it("has exactly one default, so a new signup lands somewhere definite", () => {
    // `upsertUser` reads `by_is_default` and takes `.first()`. With two
    // defaults, which role a new customer receives depends on index order —
    // stable enough to look correct in testing and wrong in production.
    const defaults = rolePresets.filter((p) => p.is_default);
    expect(defaults.map((d) => d.name)).toEqual(["Customer"]);
  });

  it("gives Super Admin the wildcard, and no one else", () => {
    const wildcard = rolePresets.filter((p) =>
      p.permissions.includes(WILDCARD_PERMISSION),
    );
    expect(wildcard.map((r) => r.name)).toEqual([SUPER_ADMIN_ROLE_NAME]);
  });

  it("grants Super Admin every permission through hasPermission", () => {
    // The wildcard is only useful if the shared evaluator honours it. This is
    // the assertion that ties the preset to the thing that reads it.
    const superAdmin = rolePresets.find(
      (p) => p.name === SUPER_ADMIN_ROLE_NAME,
    )!;
    for (const permission of [
      "orders:CREATE",
      "orders:DELETE",
      "products:UPDATE",
      "roles:CREATE",
      "insights:READ",
      "payroll:READ",
    ] as const) {
      expect(hasPermission(superAdmin.permissions, permission)).toBe(true);
    }
  });

  it("leaves the three system roles with no permissions", () => {
    // Riders, pickers and customers are gated by role NAME, not by permission.
    // A system role that also held permissions would satisfy both the name
    // bypass and permission checks — a rider reaching admin mutations.
    for (const name of ["Customer", "Rider", "Picker"]) {
      const preset = rolePresets.find((p) => p.name === name)!;
      expect(preset.permissions).toEqual([]);
      expect(isSystemRoleName(preset.name)).toBe(true);
    }
  });

  it("makes Super Admin a non-system role", () => {
    // If "Super Admin" were matched by isSystemRoleName, the name bypass would
    // grant it everything regardless of permissions — and revoking the wildcard
    // would then change nothing, which is the sort of thing discovered only
    // during an incident.
    expect(isSystemRoleName(SUPER_ADMIN_ROLE_NAME)).toBe(false);
  });

  it("has no role managing a vendor by default", () => {
    // `manages_vendor` plus an assigned vendor is what restricts an insights
    // caller. A preset switching it on would silently scope the platform owner
    // to nothing.
    expect(rolePresets.every((p) => !p.manages_vendor)).toBe(true);
  });
});

describe("isSuperAdminPermissions", () => {
  it("is true only for the wildcard", () => {
    expect(isSuperAdminPermissions(["*"])).toBe(true);
    expect(isSuperAdminPermissions(["orders:READ", "*"])).toBe(true);
    expect(isSuperAdminPermissions([])).toBe(false);
    expect(isSuperAdminPermissions(["orders:READ"])).toBe(false);
    // Not a prefix or substring match: these are real permission strings that
    // must not be mistaken for the wildcard.
    expect(isSuperAdminPermissions(["orders:*"])).toBe(false);
    expect(isSuperAdminPermissions(["**"])).toBe(false);
  });

  it("treats null and undefined as no access", () => {
    // The role is fetched with `ctx.db.get`, which returns null for a deleted
    // role. Defaulting a missing role to super admin would be catastrophic.
    expect(isSuperAdminPermissions(null)).toBe(false);
    expect(isSuperAdminPermissions(undefined)).toBe(false);
  });
});

describe("validateRolePresets", () => {
  const ok: RolePreset = {
    name: "Super Admin",
    description: "",
    permissions: ["*"],
    is_default: false,
    manages_vendor: false,
  };
  const customer: RolePreset = {
    name: "Customer",
    description: "",
    permissions: [],
    is_default: true,
    manages_vendor: false,
  };

  it("rejects two defaults", () => {
    const problems = validateRolePresets([
      ok,
      customer,
      { ...customer, name: "Rider" },
    ]);
    expect(problems.join(" ")).toContain("exactly one preset must be is_default");
  });

  it("rejects no default", () => {
    const problems = validateRolePresets([ok]);
    expect(problems.join(" ")).toContain("exactly one preset must be is_default");
  });

  it("rejects two wildcard holders", () => {
    const problems = validateRolePresets([
      ok,
      { ...ok, name: "Owner" },
      customer,
    ]);
    expect(problems.join(" ")).toContain("exactly one preset must hold the wildcard");
  });

  it("rejects duplicate names regardless of case", () => {
    const problems = validateRolePresets([
      ok,
      customer,
      { ...customer, name: "customer", is_default: false },
    ]);
    expect(problems.join(" ")).toContain("names must be unique");
  });

  it("rejects a system role that holds permissions", () => {
    const problems = validateRolePresets([
      ok,
      { ...customer, permissions: ["orders:READ"] },
    ]);
    expect(problems.join(" ")).toContain("must hold no permissions");
  });
});
