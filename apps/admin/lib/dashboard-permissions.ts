/**
 * Dashboard permission helpers.
 */

import type { PermissionResource, PermissionAction, Permission } from "@repo/lib/utils";
import { permissionResources, RESOURCE_ROUTES } from "@repo/lib/utils";

// Re-export for convenience
export { permissionResources, permissionActions, RESOURCE_ROUTES } from "@repo/lib/utils";
export type { PermissionResource, PermissionAction, Permission } from "@repo/lib/utils";

// ── PermissionAction inheritance rules ──────────────────────────────────
export function canRolePerform(
  permissions: string[],
  resource: PermissionResource,
  action: string,
): boolean {
  const hasRead = permissions.includes(`${resource}:READ`);
  const hasCreate = permissions.includes(`${resource}:CREATE`);
  const hasUpdate = permissions.includes(`${resource}:UPDATE`);

  if (action === "READ") return hasRead;
  if (action === "CREATE") return hasCreate;
  if (action === "UPDATE") return hasUpdate || hasCreate;

  // DELETE follows the same policy used elsewhere: CREATE implies DELETE.
  if (action === "DELETE") return hasCreate;

  return false;
}

// ── Route-level check ──────────────────────────────────────────
const RESOURCE_ROUTE_PREFIXES = Object.entries(RESOURCE_ROUTES).map(
  ([resource, route]) => ({ resource: resource as PermissionResource, route }),
);

export function canViewDashboardPath(
  permissions: string[],
  pathname: string,
): boolean {
  if (pathname === "/") {
    return RESOURCE_ROUTE_PREFIXES.some(({ resource }) =>
      canRolePerform(permissions, resource, "READ"),
    );
  }

  const resource = resourceForDashboardPath(pathname);
  if (!resource) return false;

  return canRolePerform(permissions, resource, "READ");
}

/**
 * Resolve which resource a dashboard path belongs to.
 */
export function resourceForDashboardPath(
  pathname: string,
): PermissionResource | undefined {
  for (const { resource, route } of RESOURCE_ROUTE_PREFIXES) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return resource;
    }
  }
  return undefined;
}

// ── Customer role blocking ─────────────────────────────────────
export function isCustomerRole(roleName: string | undefined): boolean {
  return (roleName ?? "").trim().toLowerCase() === "customer";
}
