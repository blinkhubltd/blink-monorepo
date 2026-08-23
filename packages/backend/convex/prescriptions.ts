import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Notify picker when prescription is uploaded
export const notifyPickerPrescriptionUploaded = mutation({
  args: {
    orderId: v.id("orders"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Find pickers for this vendor
    const pickerRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Picker"))
      .unique();
    const pickers = pickerRole
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", pickerRole._id))
          .filter((q) =>
            q.eq(q.field("picker_details.vendor_id"), args.vendorId),
          )
          .collect()
      : [];

    // Notify all pickers for this vendor
    for (const picker of pickers) {
      await ctx.scheduler.runAfter(0, "notifications:notifyUser" as any, {
        userId: picker._id,
        type: "system" as const,
        title: "New Prescription to Verify 📋",
        message: `Order #${order.reference?.slice(-8)} requires prescription verification.`,
        data: {
          orderId: args.orderId,
          route: `/prescription-verification`,
          orderReference: order.reference,
        },
      });
    }

    return { success: true, pickersNotified: pickers.length };
  },
});

// Check if any items in cart require prescription
export const checkCartForPrescriptionItems = query({
  args: {
    cartItems: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const prescriptionItems: any[] = [];
    const nonPrescriptionItems: any[] = [];

    for (const item of args.cartItems) {
      const product = await ctx.db.get(item.productId);
      if (product) {
        const itemData = { ...item, product };
        if (product.requires_prescription) {
          prescriptionItems.push(itemData);
        } else {
          nonPrescriptionItems.push(itemData);
        }
      }
    }

    return {
      prescriptionItems,
      nonPrescriptionItems,
      requiresPrescription: prescriptionItems.length > 0,
    };
  },
});

// Validate checkout eligibility for prescription items
export const validateCheckoutEligibility = query({
  args: {
    cartItems: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      }),
    ),
    prescriptionDocument: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const prescriptionItems: any[] = [];
    const nonPrescriptionItems: any[] = [];

    for (const item of args.cartItems) {
      const product = await ctx.db.get(item.productId);
      if (product) {
        const itemData = { ...item, product };
        if (product.requires_prescription) {
          prescriptionItems.push(itemData);
        } else {
          nonPrescriptionItems.push(itemData);
        }
      }
    }

    const requiresPrescription = prescriptionItems.length > 0;
    const hasPrescriptionDocument = Boolean(args.prescriptionDocument);

    const canProceedToCheckout =
      !requiresPrescription || hasPrescriptionDocument;

    const blockingReasons: string[] = [];
    if (requiresPrescription && !hasPrescriptionDocument) {
      blockingReasons.push(
        `Prescription required for ${prescriptionItems.length} item${prescriptionItems.length > 1 ? "s" : ""}`,
      );
    }

    return {
      prescriptionItems,
      nonPrescriptionItems,
      requiresPrescription,
      hasPrescriptionDocument,
      canProceedToCheckout,
      blockingReasons,
      summary: {
        totalItems: args.cartItems.length,
        prescriptionItemsCount: prescriptionItems.length,
        nonPrescriptionItemsCount: nonPrescriptionItems.length,
      },
    };
  },
});

// Validate specific order for prescription requirements before finalizing
export const validateOrderPrescriptionRequirements = mutation({
  args: {
    orderItems: v.array(
      v.object({
        product_id: v.id("products"),
        quantity: v.number(),
        requires_prescription: v.boolean(),
      }),
    ),
    prescriptionDocument: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const prescriptionRequiredItems = args.orderItems.filter(
      (item) => item.requires_prescription,
    );

    if (prescriptionRequiredItems.length > 0 && !args.prescriptionDocument) {
      throw new ConvexError(
        `Cannot finalize order: Prescription required for ${prescriptionRequiredItems.length} item${prescriptionRequiredItems.length > 1 ? "s" : ""} but no prescription document provided`,
      );
    }

    return {
      valid: true,
      prescriptionRequiredItems: prescriptionRequiredItems.length,
      hasPrescription: Boolean(args.prescriptionDocument),
    };
  },
});

// Update prescription status
export const updatePrescriptionStatus = mutation({
  args: {
    prescriptionId: v.id("prescriptions"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prescription = await ctx.db.get(args.prescriptionId);
    if (!prescription) {
      throw new Error("Prescription not found");
    }

    // Update prescription status
    await ctx.db.patch(args.prescriptionId, {
      status: args.status,
      notes: args.notes,
    });

    // Send push notification to customer
    const notificationTitle =
      args.status === "approved"
        ? "Prescription Approved ✅"
        : "Prescription Review Required";

    const notificationMessage =
      args.status === "approved"
        ? "Your prescription has been verified. You can now proceed with checkout."
        : args.notes
          ? `Your prescription needs attention: ${args.notes}`
          : "Your prescription could not be verified. Please upload a new, clear prescription.";

    // Schedule notification to be sent
    await ctx.scheduler.runAfter(0, "notifications:notifyUser" as any, {
      userId: prescription.user_id,
      type: "prescription_update" as const,
      title: notificationTitle,
      message: notificationMessage,
      data: {
        prescriptionId: args.prescriptionId,
        route: `/cart`,
        prescriptionStatus: args.status,
      },
    });

    return { success: true };
  },
});

// Update prescription status with rejection reason support
export const updatePrescriptionStatusWithReason = mutation({
  args: {
    prescriptionId: v.id("prescriptions"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    rejectionReasonId: v.optional(v.id("prescriptionRejectionReasons")),
    customNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prescription = await ctx.db.get(args.prescriptionId);
    if (!prescription) {
      throw new Error("Prescription not found");
    }

    let finalNotes = args.customNotes || "";

    if (args.status === "rejected" && args.rejectionReasonId) {
      const rejectionReason = await ctx.db.get(args.rejectionReasonId);
      if (rejectionReason) {
        finalNotes = rejectionReason.title;

        if (args.customNotes && args.customNotes.trim()) {
          finalNotes += `. Additional notes: ${args.customNotes.trim()}`;
        }
      }
    }

    const updateData: any = {
      status: args.status,
      notes: finalNotes,
    };

    if (args.status === "rejected" && args.rejectionReasonId) {
      updateData.rejection_reason_id = args.rejectionReasonId;
    }

    await ctx.db.patch(args.prescriptionId, updateData);

    const notificationTitle =
      args.status === "approved"
        ? "Prescription Approved ✅"
        : "Prescription Review Required";

    const notificationMessage =
      args.status === "approved"
        ? "Your prescription has been verified. You can now proceed with checkout."
        : finalNotes
          ? `Your prescription needs attention: ${finalNotes}`
          : "Your prescription could not be verified. Please upload a new, clear prescription.";

    // Schedule notification to be sent
    await ctx.scheduler.runAfter(0, "notifications:notifyUser" as any, {
      userId: prescription.user_id,
      type: "prescription_update" as const,
      title: notificationTitle,
      message: notificationMessage,
      data: {
        prescriptionId: args.prescriptionId,
        route: `/cart`,
        prescriptionStatus: args.status,
        rejectionReasonId: args.rejectionReasonId,
      },
    });

    return {
      success: true,
      rejectionReason: args.rejectionReasonId
        ? await ctx.db.get(args.rejectionReasonId)
        : null,
    };
  },
});

// Get approved prescriptions for a user and vendor
export const getApprovedPrescriptions = query({
  args: {
    clerkId: v.string(),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const approvedPrescriptions = await ctx.db
      .query("prescriptions")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("vendor_id"), args.vendorId),
          q.eq(q.field("status"), "approved"),
        ),
      )
      .collect();

    return approvedPrescriptions;
  },
});

export const uploadPrescriptionForVerification = mutation({
  args: {
    prescriptionDocument: v.id("_storage"),
    vendorId: v.id("vendors"),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const newPrescription = await ctx.db.insert("prescriptions", {
      user_id: user._id,
      prescription_document: args.prescriptionDocument,
      status: "pending",
      vendor_id: args.vendorId,
      uploaded_at: Date.now(),
    });

    // Use round-robin assignment to assign prescription to a picker
    try {
      const assignmentResult = await ctx.runMutation(
        "pickerAssignment:assignPrescriptionToPicker" as any,
        {
          prescriptionId: newPrescription,
          vendorId: args.vendorId,
        },
      );

      if (assignmentResult && assignmentResult.success) {
        // Notify the assigned picker
        await ctx.scheduler.runAfter(0, "notifications:notifyUser" as any, {
          userId: assignmentResult.assignedPickerId,
          type: "system" as const,
          title: "New Prescription to Verify 📋",
          message: `A new prescription from ${user.name} has been assigned to you for verification.`,
          data: {
            prescriptionId: newPrescription,
            route: `/prescription-verification`,
          },
        });
      }

      return {
        success: true,
        prescriptionId: newPrescription,
        assignedPickerId: assignmentResult?.assignedPickerId,
      };
    } catch (error) {
      console.error("Failed to assign prescription to picker:", error);
      return {
        success: true,
        prescriptionId: newPrescription,
        assignedPickerId: null,
      };
    }
  },
});

// Get orders awaiting prescription verification for a specific picker
export const getOrdersAwaitingPrescription = query({
  args: {
    pickerId: v.id("users"),
    vendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    // Get prescriptions assigned to this picker
    const prescriptionAssignments = await ctx.db
      .query("picker_assignments")
      .withIndex("by_picker", (q) => q.eq("picker_id", args.pickerId))
      .filter((q) => q.eq(q.field("type"), "prescription"))
      .collect();

    const prescriptionsWithDetails = await Promise.all(
      prescriptionAssignments.map(async (assignment) => {
        if (!assignment.prescription_id) return null;

        const prescription = await ctx.db.get(assignment.prescription_id);
        if (!prescription || prescription.status !== "pending") return null;

        // Filter by vendor if specified
        if (args.vendorId && prescription.vendor_id !== args.vendorId)
          return null;

        // Get user details
        const user = await ctx.db.get(prescription.user_id);

        return {
          ...prescription,
          user,
          assignment,
        };
      }),
    );

    return prescriptionsWithDetails.filter((item) => item !== null);
  },
});

// Get prescription document URL
export const getPrescriptionDocumentUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Update prescription verification status for products
export const updateProductPrescriptionVerification = mutation({
  args: {
    productId: v.id("products"),
    verified: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      prescription_verified: args.verified,
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

// Get the latest prescription status for a user and vendor
export const getPrescriptionStatus = query({
  args: {
    clerkId: v.string(),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    // Get the most recent prescription for this vendor
    const prescription = await ctx.db
      .query("prescriptions")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .filter((q) => q.eq(q.field("vendor_id"), args.vendorId))
      .order("desc")
      .first();

    return prescription;
  },
});

// Get the latest prescription statuses for a user and multiple vendors
export const getPrescriptionStatuses = query({
  args: {
    clerkId: v.string(),
    vendorIds: v.array(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const results = await Promise.all(
      args.vendorIds.map(async (vendorId) => {
        const prescription = await ctx.db
          .query("prescriptions")
          .withIndex("by_user", (q) => q.eq("user_id", user._id))
          .filter((q) => q.eq(q.field("vendor_id"), vendorId))
          .order("desc")
          .first();

        return {
          vendorId,
          status: prescription ? prescription : null,
        };
      }),
    );

    return results;
  },
});
