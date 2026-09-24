import { internalMutation } from "./_generated/server";

/**
 * One-off data fixes for rows that were seeded before a bug in
 * `lib/role_presets.ts` was caught. Each function here targets exactly one
 * such fix — this is not a general-purpose migration runner, just a place
 * for them to live and be run once from the Convex dashboard (or `npx convex
 * run`, for whoever has deploy access) rather than by hand-editing rows.
 */

/**
 * Rider and Picker were seeded with `manages_vendor: false`. Every
 * vendor-assignment screen (`RoleAssignmentDialog`, `InviteUserDialog`, the
 * Customers table's bulk-assign bar, and `validateInvite` on the invite
 * path) gates its vendor picker on exactly this flag, so a deployment that
 * seeded the old value could never actually attach a vendor to a rider or
 * picker through any of them — the picker silently did not render.
 *
 * `ensureRoles` (`user/bootstrap.ts`) never patches a role that already
 * exists, on purpose (it must not overwrite permissions someone has since
 * edited through the roles page), so fixing `role_presets.ts` alone only
 * helps a deployment that has not seeded its roles yet. This is the other
 * half: a targeted, idempotent patch for one that already has.
 *
 * `internalMutation`, not `mutation` — this is a one-time repair, not
 * something any screen should ever call, so it is reachable only from the
 * Convex dashboard's function runner or `npx convex run`, never from a
 * client. Safe to run more than once: a role already patched is skipped.
 */
export const fixRiderPickerManagesVendor = internalMutation({
  args: {},
  handler: async (ctx) => {
    const patched: string[] = [];
    const alreadyCorrect: string[] = [];
    const missing: string[] = [];

    for (const name of ["Rider", "Picker"] as const) {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();

      if (!role) {
        missing.push(name);
        continue;
      }
      if (role.manages_vendor) {
        alreadyCorrect.push(name);
        continue;
      }

      await ctx.db.patch(role._id, { manages_vendor: true });
      patched.push(name);
    }

    return { patched, alreadyCorrect, missing };
  },
});
