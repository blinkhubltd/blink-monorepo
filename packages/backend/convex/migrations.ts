import { internalMutation } from "./_generated/server";
import { missingRiderDocuments } from "./user/rider_onboarding";

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

/**
 * Rider approval (`rider_details.approved_at`) is new, and the rider app now
 * refuses anyone without it. Riders already working would be locked out the
 * moment it ships, so this marks as approved exactly those who were already
 * treated as vetted: documents complete AND currently online or on a
 * delivery. Anyone else — documents missing, or offline with no way to tell
 * whether they were ever vetted — goes through the new review, where an admin
 * approves them from the Staff page.
 *
 * Run once, after deploying. Idempotent: already-approved riders are skipped.
 */
export const backfillRiderApproval = internalMutation({
  args: {},
  handler: async (ctx) => {
    const roles = await ctx.db.query("roles").collect();
    const riderRole = roles.find((r) => r.name.trim().toLowerCase() === "rider");
    if (!riderRole) return { approved: 0, leftForReview: 0 };

    const riders = await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", riderRole._id))
      .collect();

    let approved = 0;
    let leftForReview = 0;
    const now = Date.now();
    for (const rider of riders) {
      const details = rider.rider_details;
      if (!details || details.approved_at) continue;
      const working = details.status === "Active" || details.status === "On Delivery";
      if (working && missingRiderDocuments(rider).length === 0) {
        await ctx.db.patch(rider._id, {
          rider_details: { ...details, approved_at: now },
        });
        approved++;
      } else {
        leftForReview++;
      }
    }
    return { approved, leftForReview };
  },
});
