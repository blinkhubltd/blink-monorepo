import { describe, expect, it } from "vitest";
import {
  buildAllPermissions,
  findMalformedPermissions,
  getAccessibleRoutes,
  grantableActions,
  hasAnyPermission,
  hasPermission,
  isAllowed,
  isSystemRoleName,
  permissionResources,
  RESOURCE_ROUTES,
  WILDCARD_PERMISSION,
} from "./permissions";

/**
 * These tests are the guard rail for the auth migration. Every Convex guard and
 * the admin roles form evaluate through this module, so a regression here is a
 * silent access-control change across three apps.
 *
 * The values asserted against the live database come from the Phase B0
 * production audit (`parity/baseline/AUDIT-FINDINGS.md`).
 */

describe("inheritance rules", () => {
  it("CREATE satisfies CREATE, UPDATE and DELETE", () => {
    const perms = ["orders:CREATE"];
    expect(hasPermission(perms, "orders:CREATE")).toBe(true);
    expect(hasPermission(perms, "orders:UPDATE")).toBe(true);
    expect(hasPermission(perms, "orders:DELETE")).toBe(true);
  });

  it("CREATE does not satisfy READ", () => {
    // Deliberate: dashboard-permissions.ts never treated CREATE as implying READ,
    // and widening it here would silently grant read access to every creator.
    expect(hasPermission(["orders:CREATE"], "orders:READ")).toBe(false);
  });

  it("UPDATE does not imply CREATE or DELETE", () => {
    const perms = ["orders:UPDATE"];
    expect(hasPermission(perms, "orders:UPDATE")).toBe(true);
    expect(hasPermission(perms, "orders:CREATE")).toBe(false);
    expect(hasPermission(perms, "orders:DELETE")).toBe(false);
  });

  it("READ stands alone", () => {
    const perms = ["orders:READ"];
    expect(hasPermission(perms, "orders:READ")).toBe(true);
    expect(hasPermission(perms, "orders:UPDATE")).toBe(false);
  });

  it("does not leak across resources", () => {
    expect(hasPermission(["orders:CREATE"], "payments:UPDATE")).toBe(false);
  });
});

describe("wildcard", () => {
  it("grants every resource and action", () => {
    const perms = [WILDCARD_PERMISSION];
    for (const r of permissionResources) {
      expect(hasPermission(perms, `${r}:READ`)).toBe(true);
      expect(hasPermission(perms, `${r}:DELETE`)).toBe(true);
    }
  });

  it("grants every route", () => {
    const routes = getAccessibleRoutes([WILDCARD_PERMISSION]);
    expect(new Set(routes)).toEqual(new Set(Object.values(RESOURCE_ROUTES)));
  });
});

describe("denial", () => {
  it("an empty list denies everything", () => {
    expect(hasPermission([], "orders:READ")).toBe(false);
    expect(getAccessibleRoutes([])).toEqual([]);
  });

  it("unknown resources and actions deny", () => {
    expect(hasPermission(["nonsense:CREATE"], "orders:READ")).toBe(false);
    // @ts-expect-error — asserting the runtime guard, not the type
    expect(hasPermission(["orders:CREATE"], "orders:EXECUTE")).toBe(false);
  });

  it("malformed stored entries never match", () => {
    // roles.permissions is an unvalidated v.array(v.string()) in the schema.
    expect(hasPermission(["", ":", "orders:", ":READ"], "orders:READ")).toBe(
      false,
    );
  });
});

describe("system role bypass", () => {
  it("matches case-insensitively — the DB stores Title Case", () => {
    for (const n of ["Rider", "rider", "RIDER", " Picker ", "Customer"]) {
      expect(isSystemRoleName(n)).toBe(true);
    }
  });

  it("does not treat admin roles as system roles", () => {
    // Exact role names from the live database.
    for (const n of [
      "SUPER ADMIN",
      "GENERAL MANAGER",
      "Hub Manager",
      "Supervisor",
      "Clearance Vendor Manager",
    ]) {
      expect(isSystemRoleName(n)).toBe(false);
    }
  });

  it("handles null and undefined", () => {
    expect(isSystemRoleName(null)).toBe(false);
    expect(isSystemRoleName(undefined)).toBe(false);
  });

  it("lets riders and pickers through despite holding zero permissions", () => {
    // Verified in production: RIDER and PICKER both have permissions: [].
    // A permission check can therefore never pass for them, which is why the
    // bypass exists and why removing it would lock every rider out.
    expect(isAllowed("Rider", [], "orders:READ")).toBe(true);
    expect(isAllowed("Picker", [], "prescriptions:UPDATE")).toBe(true);
  });

  it("still evaluates permissions for admin roles", () => {
    expect(isAllowed("SUPER ADMIN", [], "orders:READ")).toBe(false);
    expect(isAllowed("SUPER ADMIN", ["orders:READ"], "orders:READ")).toBe(true);
  });
});

describe("live database compatibility", () => {
  // The Phase B0 audit found four resources granted in production that the old
  // 17-entry list omitted. A template union built from the old list would have
  // rejected live data on the first deploy. This test is what stops that
  // recurring.
  it("includes the four resources the old code was missing", () => {
    for (const r of ["customers", "pickers", "riders", "staff"] as const) {
      expect(permissionResources).toContain(r);
    }
  });

  it("accepts every permission string present in the live roles table", () => {
    // SUPER ADMIN's 54 grants, abbreviated to one per distinct resource.
    const live = permissionResources.map((r) => `${r}:READ`);
    expect(findMalformedPermissions(live)).toEqual([]);
  });

  it("only CREATE, READ and UPDATE are grantable", () => {
    // The admin roles form emits only these three; DELETE is checkable but
    // never stored.
    expect([...grantableActions]).toEqual(["CREATE", "READ", "UPDATE"]);
    expect(findMalformedPermissions(["orders:DELETE"])).toEqual([
      "orders:DELETE",
    ]);
  });
});

describe("exhaustiveness — the checks that catch the next drift", () => {
  it("every resource has a dashboard route", () => {
    for (const r of permissionResources) {
      expect(RESOURCE_ROUTES[r], `missing route for ${r}`).toBeTruthy();
    }
  });

  it("RESOURCE_ROUTES has no keys outside the resource list", () => {
    expect(Object.keys(RESOURCE_ROUTES).sort()).toEqual(
      [...permissionResources].sort(),
    );
  });

  it("buildAllPermissions covers resources x grantable actions exactly", () => {
    const all = buildAllPermissions();
    expect(all).toHaveLength(
      permissionResources.length * grantableActions.length,
    );
    expect(new Set(all).size).toBe(all.length);
    expect(findMalformedPermissions(all)).toEqual([]);
  });
});

describe("hasAnyPermission", () => {
  it("passes when any one is held, fails when none are", () => {
    const perms = ["payments:READ"];
    expect(hasAnyPermission(perms, ["orders:READ", "payments:READ"])).toBe(true);
    expect(hasAnyPermission(perms, ["orders:READ", "users:READ"])).toBe(false);
    expect(hasAnyPermission(perms, [])).toBe(false);
  });
});

describe("getAccessibleRoutes", () => {
  it("returns a route for each granted resource, deduplicated", () => {
    // customers and users both map to /users.
    const routes = getAccessibleRoutes(["customers:READ", "users:READ"]);
    expect(routes).toEqual(["/users"]);
  });

  it("ignores resources with no grant", () => {
    expect(getAccessibleRoutes(["orders:READ"])).toEqual(["/orders"]);
  });
});
