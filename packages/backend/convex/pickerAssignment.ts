import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Store picker assignment state for round-robin
export const getNextPickerForVendor = query({
  args: {
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    // Get all active pickers for this vendor
    const pickerRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Picker"))
      .unique();
    const pickers = pickerRole
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", pickerRole._id))
          .filter((q) =>
            q.and(
              q.eq(q.field("picker_details.vendor_id"), args.vendorId),
              q.eq(q.field("picker_details.status"), "Active"),
            ),
          )
          .collect()
      : [];

    if (pickers.length === 0) {
      return null;
    }

    if (pickers.length === 1) {
      return pickers[0]._id;
    }

    // Get the last assignment for this vendor
    const lastAssignment = await ctx.db
      .query("picker_assignments")
      .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
      .order("desc")
      .first();

    if (!lastAssignment) {
      // First assignment, pick the first picker
      return pickers[0]._id;
    }

    // Find current picker index and get next one
    const currentIndex = pickers.findIndex(
      (p) => p._id === lastAssignment.picker_id,
    );
    const nextIndex = (currentIndex + 1) % pickers.length;

    return pickers[nextIndex]._id;
  },
});

// Assign an order to a picker using round-robin
export const assignOrderToPicker = mutation({
  args: {
    orderId: v.id("orders"),
    vendorId: v.id("vendors"),
    type: v.union(v.literal("order"), v.literal("prescription")),
    prescriptionId: v.optional(v.id("prescriptions")),
  },
  handler: async (ctx, args) => {
    // Check if this is a prescription-related order and if the prescription was already verified by a picker
    if (args.prescriptionId) {
      const prescription = await ctx.db.get(args.prescriptionId);
      if (prescription && prescription.assigned_picker_id) {
        // Only re-assign to the same picker if they are still active
        const verifyingPicker = await ctx.db.get(
          prescription.assigned_picker_id,
        );
        if (
          verifyingPicker &&
          verifyingPicker.picker_details?.status === "Active"
        ) {
          await ctx.db.insert("picker_assignments", {
            vendor_id: args.vendorId,
            picker_id: prescription.assigned_picker_id,
            order_id: args.orderId,
            prescription_id: args.prescriptionId,
            type: args.type,
            assigned_at: Date.now(),
          });

          await ctx.db.patch(args.orderId, {
            assigned_picker_id: prescription.assigned_picker_id,
          });

          return {
            success: true,
            assignedPickerId: prescription.assigned_picker_id,
            reason: "Same picker who verified prescription",
          };
        }
        // Picker is no longer active — fall through to round-robin
      }
    }

    // Get next picker using round-robin
    const nextPickerId = await ctx.runQuery(
      "pickerAssignment:getNextPickerForVendor" as any,
      {
        vendorId: args.vendorId,
      },
    );

    if (!nextPickerId) {
      throw new Error("No pickers available for this vendor");
    }

    // Create assignment record
    await ctx.db.insert("picker_assignments", {
      vendor_id: args.vendorId,
      picker_id: nextPickerId,
      order_id: args.orderId,
      prescription_id: args.prescriptionId,
      type: args.type,
      assigned_at: Date.now(),
    });

    // Update order with assigned picker
    await ctx.db.patch(args.orderId, {
      assigned_picker_id: nextPickerId,
    });

    return {
      success: true,
      assignedPickerId: nextPickerId,
      reason: "Round-robin assignment",
    };
  },
});

// Assign a prescription to a picker using round-robin
export const assignPrescriptionToPicker = mutation({
  args: {
    prescriptionId: v.id("prescriptions"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    // Get next picker using round-robin
    const nextPickerId = await ctx.runQuery(
      "pickerAssignment:getNextPickerForVendor" as any,
      {
        vendorId: args.vendorId,
      },
    );

    if (!nextPickerId) {
      throw new Error("No pickers available for this vendor");
    }

    // Create assignment record
    await ctx.db.insert("picker_assignments", {
      vendor_id: args.vendorId,
      picker_id: nextPickerId,
      prescription_id: args.prescriptionId,
      type: "prescription",
      assigned_at: Date.now(),
    });

    // Update prescription with assigned picker
    await ctx.db.patch(args.prescriptionId, {
      assigned_picker_id: nextPickerId,
    });

    return {
      success: true,
      assignedPickerId: nextPickerId,
    };
  },
});

// Get orders assigned to a specific picker
export const getPickerAssignedOrders = query({
  args: {
    pickerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("picker_assignments")
      .withIndex("by_picker", (q) => q.eq("picker_id", args.pickerId))
      .filter((q) => q.eq(q.field("type"), "order"))
      .collect();

    const ordersWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const order = assignment.order_id
          ? await ctx.db.get(assignment.order_id)
          : null;
        const orderItems = assignment.order_id
          ? await ctx.db
              .query("order_items")
              .withIndex("by_order", (q) =>
                q.eq("order_id", assignment.order_id!),
              )
              .collect()
          : [];

        const user = order ? await ctx.db.get(order.user_id) : null;

        return {
          assignment,
          order,
          items: orderItems,
          user,
        };
      }),
    );

    return ordersWithDetails.filter((item) => item.order !== null);
  },
});

// Get prescriptions assigned to a specific picker
export const getPickerAssignedPrescriptions = query({
  args: {
    pickerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("picker_assignments")
      .withIndex("by_picker", (q) => q.eq("picker_id", args.pickerId))
      .filter((q) => q.eq(q.field("type"), "prescription"))
      .collect();

    const prescriptionsWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const prescription = assignment.prescription_id
          ? await ctx.db.get(assignment.prescription_id)
          : null;
        const user = prescription
          ? await ctx.db.get(prescription.user_id)
          : null;

        return {
          assignment,
          prescription,
          user,
        };
      }),
    );

    return prescriptionsWithDetails.filter(
      (item) => item.prescription !== null,
    );
  },
});

// Get assignment statistics for a vendor
export const getVendorAssignmentStats = query({
  args: {
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("picker_assignments")
      .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
      .collect();

    const pickerRoleForStats = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Picker"))
      .unique();
    const pickers = pickerRoleForStats
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) =>
            q.eq("role_id", pickerRoleForStats._id),
          )
          .filter((q) =>
            q.eq(q.field("picker_details.vendor_id"), args.vendorId),
          )
          .collect()
      : [];

    const stats = pickers.map((picker) => {
      const pickerAssignments = assignments.filter(
        (a) => a.picker_id === picker._id,
      );
      return {
        picker_id: picker._id,
        picker_name: picker.name,
        total_assignments: pickerAssignments.length,
        order_assignments: pickerAssignments.filter((a) => a.type === "order")
          .length,
        prescription_assignments: pickerAssignments.filter(
          (a) => a.type === "prescription",
        ).length,
      };
    });

    return stats;
  },
});
