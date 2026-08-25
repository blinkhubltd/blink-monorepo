"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { PermissionResource, Permission } from "@repo/lib/utils";
import { canRolePerform } from "@/lib/dashboard-permissions";

/**
 * Resolves the full Clerk → Convex user → Role → Permissions chain.
 * Authorization uses role_id membership in getAdminRoles — never user.role string.
 */
export function useCurrentUserPermissions() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();

  // Step 1: Resolve Clerk ID → Convex user
  const convexUser = useQuery(
    api.user.users.getCurrentUser,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip",
  );

  // Step 2: Fetch role using user's role_id
  const role = useQuery(
    api.user.roles.getRole,
    convexUser?.role_id ? { id: convexUser.role_id } : "skip",
  );

  // Step 3: Fetch the list of roles that are authorised to access the dashboard
  const adminRoles = useQuery(api.user.users.getAdminRoles);

  // Step 4: Extract permissions array
  const permissions = role?.permissions ?? [];

  const isLoading =
    !clerkLoaded ||
    convexUser === undefined ||
    (convexUser?.role_id ? role === undefined : false) ||
    adminRoles === undefined;

  // Whether the current user's role_id is in the admin-roles list
  const isAdminUser =
    !isLoading &&
    !!convexUser?.role_id &&
    (adminRoles?.some((r: any) => r._id === convexUser.role_id) ?? false);

  // Step 5: `can()` helper — admin users have absolute permissions
  const can = (
    permission: Permission | `${PermissionResource}:DELETE` | string,
  ): boolean => {
    if (isAdminUser) return true;
    const [resource, action] = permission.split(":") as [PermissionResource, string];
    if (!resource || !action) return false;
    return canRolePerform(permissions, resource, action);
  };

  return {
    isLoading,
    permissions,
    can,
    convexUser,
    role,
    isAdminUser,
  };
}
