import { query } from "../_generated/server";
import { isSuperAdminPermissions } from "../lib/role_presets";

/**
 * Everything the dashboard needs to decide what the signed-in user may see.
 *
 * ── Why one query ─────────────────────────────────────────────────────────
 *
 * `useCurrentUserPermissions` used to chain three: `getCurrentUser` by Clerk id,
 * then `getRole` by the returned `role_id`, then `getAdminRoles`. Three
 * dependent round trips before the first page can decide whether to render, and
 * the middle one is skipped when the user has no role — which is what made the
 * hook's loading state impossible to get right, because a skipped `useQuery`
 * returns `undefined`, indistinguishable from still loading.
 *
 * ── Why `getAdminRoles` is not the authority any more ─────────────────────
 *
 * It returns every role whose name is not Rider, Picker or Customer, and the
 * dashboard treated membership in that list as absolute access. So ANY role — a
 * "Warehouse Clerk" with a single `orders:READ` permission — had total access to
 * every module, and its `permissions` array was decorative. A role's permissions
 * meaning nothing is not a subtle bug; it means the roles page does nothing.
 *
 * Absolute access is now the wildcard `"*"` and nothing else. Everything below it
 * goes through `hasPermission`, which is the same module the backend guards use,
 * so a screen that renders and a mutation that rejects cannot disagree.
 */
export const getMyAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    // Signed out is a RESULT, not an error and not a skip. The caller can tell
    // "no session" from "still loading" because loading is `undefined` and this
    // is a concrete object.
    if (!identity) {
      return {
        signedIn: false as const,
        hasUser: false,
        userId: null,
        roleId: null,
        roleName: null,
        permissions: [] as string[],
        isSuperAdmin: false,
        managesVendor: false,
        assignedVendorIds: [] as string[],
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      // Authenticated with Clerk but no Convex row — the webhook has not run.
      // Distinguished from "no role" because the fix is different: one is a
      // misconfigured webhook, the other is an unassigned user.
      return {
        signedIn: true as const,
        hasUser: false,
        userId: null,
        roleId: null,
        roleName: null,
        permissions: [] as string[],
        isSuperAdmin: false,
        managesVendor: false,
        assignedVendorIds: [] as string[],
      };
    }

    const role = user.role_id ? await ctx.db.get(user.role_id) : null;
    const permissions = role?.permissions ?? [];

    return {
      signedIn: true as const,
      hasUser: true,
      userId: user._id,
      roleId: role?._id ?? null,
      roleName: role?.name ?? null,
      permissions,
      isSuperAdmin: isSuperAdminPermissions(permissions),
      managesVendor: role?.manages_vendor ?? false,
      /**
       * Ids only, as strings. The dashboard needs to know it is scoped; the
       * vendor documents themselves come from `insights_scope.visibleVendors`,
       * which projects away commission and bank details.
       */
      assignedVendorIds: (user.manager_details?.vendor_id ?? []).map(String),
    };
  },
});
