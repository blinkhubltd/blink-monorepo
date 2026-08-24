import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  PrescriptionRejectionReasonValidator,
  PrescriptionRejectionReasonUpdateValidator,
} from "../validators";

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || !user.isStaff) {
      throw new Error("Not authorized to view all rejection reasons");
    }

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Only staff can create system default reasons
    if (args.is_system_default && !user.isStaff) {
      throw new Error("Not authorized to create system default reasons");
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const rejectionReason = await ctx.db.get(args.id);
    if (!rejectionReason) {
      throw new Error("Rejection reason not found");
    }

    // Only staff can update system default reasons
    // Users can only update their own custom reasons
    if (rejectionReason.is_system_default && !user.isStaff) {
      throw new Error("Not authorized to update system default reasons");
    }

    if (
      !rejectionReason.is_system_default &&
      rejectionReason.created_by !== user._id &&
      !user.isStaff
    ) {
      throw new Error("Not authorized to update this rejection reason");
    }

    const updateData: any = {
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

// Mutation to delete/deactivate a rejection reason
export const deactivateRejectionReason = mutation({
  args: { id: v.id("prescriptionRejectionReasons") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const rejectionReason = await ctx.db.get(args.id);
    if (!rejectionReason) {
      throw new Error("Rejection reason not found");
    }

    // Only staff can deactivate system default reasons
    // Users can only deactivate their own custom reasons
    if (rejectionReason.is_system_default && !user.isStaff) {
      throw new Error("Not authorized to deactivate system default reasons");
    }

    if (
      !rejectionReason.is_system_default &&
      rejectionReason.created_by !== user._id &&
      !user.isStaff
    ) {
      throw new Error("Not authorized to deactivate this rejection reason");
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const rejectionReason = await ctx.db.get(args.id);
    if (!rejectionReason) {
      throw new Error("Rejection reason not found");
    }

    // Only staff can delete system default reasons
    if (rejectionReason.is_system_default && !user.isStaff) {
      throw new Error("Not authorized to delete system default reasons");
    }

    if (
      !rejectionReason.is_system_default &&
      rejectionReason.created_by !== user._id &&
      !user.isStaff
    ) {
      throw new Error("Not authorized to delete this rejection reason");
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || !user.isStaff) {
      throw new Error("Not authorized to seed system reasons");
    }

    // Check if system reasons already exist
    const existingReasons = await ctx.db
      .query("prescriptionRejectionReasons")
      .withIndex("by_system_default", (q) => q.eq("is_system_default", true))
      .collect();

    if (existingReasons.length > 0) {
      throw new Error("System rejection reasons already exist");
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
