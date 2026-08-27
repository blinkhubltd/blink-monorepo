import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { assertStaffOrPermission, getAuthUser } from "../auth.helpers";
import { PrescriptionRejectionReasonUpdateValidator } from "../validators";

/**
 * Prescription rejection reasons: the system defaults plus whatever custom ones
 * staff have added.
 *
 * ── Why every staff-only gate went through `assertStaffOrPermission` ──────
 *
 * Every one of these checked `user.isStaff` directly, inline, with no fallback:
 *
 *     if (!user || !user.isStaff) {
 *       throw new Error("Not authorized to view all rejection reasons");
 *     }
 *
 * `isStaff` is a boolean this codebase never sets on any write path — it is
 * orthogonal to `role_id` and to the wildcard permission this app's roles now
 * use for absolute access. So a freshly-claimed super admin, whose access comes
 * entirely from holding `"*"` on their role, has `isStaff` unset and was
 * refused by all six of these checks. That is the "Not authorized to view all
 * rejection reasons" error on /prescriptions/rejection-reasons.
 *
 * `auth.helpers.assertStaffOrPermission` already exists to bridge exactly this
 * — it passes on `isStaff === true` OR the caller holding the permission (which
 * the wildcard satisfies) — but this file never adopted it and hand-rolled the
 * checks instead. Also, whether a caller may act on their OWN custom reason was
 * previously unconditional (no staff/permission needed) and stays that way:
 * `getAuthUser` alone gates create/update/deactivate on a caller's own record,
 * and `assertStaffOrPermission` is reached only for system defaults or someone
 * else's reason.
 */

// Query to get all active rejection reasons (both system defaults and custom)
export const getActiveRejectionReasons = query({
  args: {},
  handler: async (ctx) => {
    const reasons = await ctx.db
      .query("prescriptionRejectionReasons")
      .withIndex("by_active_system", (q) => q.eq("is_active", true))
      .order("desc")
      .collect();

    // Sort so system defaults come first
    return reasons.sort((a, b) => {
      if (a.is_system_default && !b.is_system_default) return -1;
      if (!a.is_system_default && b.is_system_default) return 1;
      return 0;
    });
  },
});

export const getAllRejectionReasons = query({
  args: {},
  handler: async (ctx) => {
    await assertStaffOrPermission(ctx, "prescriptions:READ");

    return await ctx.db
      .query("prescriptionRejectionReasons")
      .order("desc")
      .collect();
  },
});

// Mutation to create a new rejection reason
export const createRejectionReason = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    is_system_default: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    // Only staff (or a holder of the permission) can create SYSTEM defaults —
    // any signed-in user may create their own custom reason.
    if (args.is_system_default) {
      await assertStaffOrPermission(ctx, "prescriptions:CREATE");
    }

    const rejectionReason = {
      title: args.title.trim(),
      description: args.description?.trim(),
      is_active: true,
      is_system_default: args.is_system_default || false,
      created_by: args.is_system_default ? undefined : user._id,
      created_at: Date.now(),
    };

    return await ctx.db.insert("prescriptionRejectionReasons", rejectionReason);
  },
});

// Mutation to update a rejection reason
export const updateRejectionReason = mutation({
  args: PrescriptionRejectionReasonUpdateValidator,
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const rejectionReason = await ctx.db.get(args.id);
    if (!rejectionReason) {
      throw new ConvexError("Rejection reason not found");
    }

    // A caller may freely edit their OWN custom reason. Everything else —
    // a system default, or someone else's reason — needs the staff gate.
    // `created_by` is unset on every system default, so `isOwner` is false for
    // those without a separate branch.
    const isOwner = rejectionReason.created_by === user._id;
    if (!isOwner) {
      await assertStaffOrPermission(ctx, "prescriptions:UPDATE");
    }

    const updateData: {
      updated_at: number;
      title?: string;
      description?: string;
      is_active?: boolean;
    } = {
      updated_at: Date.now(),
    };

    if (args.title !== undefined) updateData.title = args.title.trim();
    if (args.description !== undefined)
      updateData.description = args.description?.trim();
    if (args.is_active !== undefined) updateData.is_active = args.is_active;

    await ctx.db.patch(args.id, updateData);
    return args.id;
  },
});

// Mutation to deactivate a rejection reason
export const deactivateRejectionReason = mutation({
  args: { id: v.id("prescriptionRejectionReasons") },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const rejectionReason = await ctx.db.get(args.id);
    if (!rejectionReason) {
      throw new ConvexError("Rejection reason not found");
    }

    const isOwner = rejectionReason.created_by === user._id;
    if (!isOwner) {
      await assertStaffOrPermission(ctx, "prescriptions:UPDATE");
    }

    await ctx.db.patch(args.id, {
      is_active: false,
      updated_at: Date.now(),
    });

    return args.id;
  },
});

// Mutation to hard delete a rejection reason
export const deleteRejectionReason = mutation({
  args: { id: v.id("prescriptionRejectionReasons") },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const rejectionReason = await ctx.db.get(args.id);
    if (!rejectionReason) {
      throw new ConvexError("Rejection reason not found");
    }

    const isOwner = rejectionReason.created_by === user._id;
    if (!isOwner) {
      await assertStaffOrPermission(ctx, "prescriptions:DELETE");
    }

    // Check if the reason is being used by any prescriptions
    const usedInPrescriptions = await ctx.db
      .query("prescriptions")
      .withIndex("by_rejection_reason", (q) =>
        q.eq("rejection_reason_id", args.id),
      )
      .first();

    if (usedInPrescriptions) {
      throw new ConvexError(
        "Cannot delete this reason as it is associated with existing prescriptions. Please deactivate it instead.",
      );
    }

    await ctx.db.delete(args.id);

    return args.id;
  },
});

// Mutation to seed initial system rejection reasons (for setup)
export const seedSystemRejectionReasons = mutation({
  args: {},
  handler: async (ctx) => {
    await assertStaffOrPermission(ctx, "prescriptions:CREATE");

    // Check if system reasons already exist
    const existingReasons = await ctx.db
      .query("prescriptionRejectionReasons")
      .withIndex("by_system_default", (q) => q.eq("is_system_default", true))
      .collect();

    if (existingReasons.length > 0) {
      throw new ConvexError("System rejection reasons already exist");
    }

    const systemReasons = [
      {
        title: "Prescription is unclear or illegible",
        description:
          "The prescription document cannot be clearly read or understood",
        is_active: true,
        is_system_default: true,
        created_at: Date.now(),
      },
      {
        title: "Prescription has expired",
        description: "The prescription date indicates it is no longer valid",
        is_active: true,
        is_system_default: true,
        created_at: Date.now(),
      },
      {
        title: "Prescription appears to be altered or fraudulent",
        description:
          "The prescription shows signs of tampering or appears to be fake",
        is_active: true,
        is_system_default: true,
        created_at: Date.now(),
      },
    ];

    const createdReasons = [];
    for (const reason of systemReasons) {
      const id = await ctx.db.insert("prescriptionRejectionReasons", reason);
      createdReasons.push(id);
    }

    return createdReasons;
  },
});
