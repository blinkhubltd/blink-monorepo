"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { PermissionResource, Permission } from "@repo/lib/utils";
import { canRolePerform } from "@/lib/dashboard-permissions";

/**
 * The signed-in user's access.
 *
 * ── The bug this replaces ─────────────────────────────────────────────────
 *
 * The previous version chained three queries and computed:
 *
 *     const convexUser = useQuery(getCurrentUser, clerkUser?.id ? {...} : "skip");
 *     const isLoading = !clerkLoaded || convexUser === undefined || ...;
 *
 * A SKIPPED `useQuery` returns `undefined`, exactly like a query in flight. So
 * for a signed-out visitor `convexUser` was `undefined` forever, `isLoading`
 * stayed true forever, and `AuthorizationWrapper` rendered its spinner forever.
 * That is the "admin app loads non-stop and never redirects to sign-in" symptom:
 * not a slow query, but a loading state with no way to end.
 *
 * The fix is not a cleverer condition. It is that "signed out" has to be a VALUE
 * rather than the absence of one — so `getMyAccess` takes no arguments, is never
 * skipped, and returns `{ signedIn: false }` for an anonymous caller. `undefined`
 * then means one thing only: still loading.
 *
 * ── Absolute access is the wildcard, not the role name ───────────────────
 *
 * `isAdminUser` was "the user's role_id appears in getAdminRoles", and
 * `getAdminRoles` returns every role not named Rider, Picker or Customer. Any
 * role at all therefore granted total access, and its permissions array was
 * decorative. It is now the `"*"` permission and nothing else.
 */
export function useCurrentUserPermissions() {
  const { isLoaded: clerkLoaded } = useAuth();
  const access = useQuery(api.user.access.getMyAccess, {});

  // Undefined means in flight, and nothing else — there is no skip branch.
  const isLoading = !clerkLoaded || access === undefined;

  const permissions = access?.permissions ?? [];
  const isSuperAdmin = access?.isSuperAdmin ?? false;

  const can = (
    permission: Permission | `${PermissionResource}:DELETE` | string,
  ): boolean => {
    // Deny while loading. Defaulting to allow would flash content the user may
    // not be entitled to before taking it away again.
    if (isLoading) return false;
    if (isSuperAdmin) return true;
    const [resource, action] = permission.split(":") as [
      PermissionResource,
      string,
    ];
    if (!resource || !action) return false;
    return canRolePerform(permissions, resource, action);
  };

  return {
    isLoading,
    permissions,
    can,
    /** True once Clerk has a session, whether or not Convex knows the user. */
    isSignedIn: access?.signedIn ?? false,
    /**
     * Whether the Clerk webhook has produced a Convex row. Signed in without one
     * is a misconfigured webhook, which needs a different message from having no
     * role — so these are separate flags rather than one "unauthorized".
     */
    hasConvexUser: access?.hasUser ?? false,
    /** Null when the user exists but has no role assigned. */
    roleName: access?.roleName ?? null,
    hasRole: Boolean(access?.roleId),
    isAdminUser: isSuperAdmin,
    isSuperAdmin,
    managesVendor: access?.managesVendor ?? false,
    assignedVendorIds: access?.assignedVendorIds ?? [],
    /**
     * Kept for callers that read the id; the full document is not exposed.
     *
     * The `userId` truthiness check is what narrows `Id<"users"> | null` down to
     * `Id<"users">` for consumers — `hasUser` alone tells TypeScript nothing
     * about the other field.
     */
    convexUser:
      access?.hasUser && access.userId ? { _id: access.userId } : null,
  };
}
