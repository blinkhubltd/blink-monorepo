import { v, ConvexError } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { getAuthUser, getAuthUserOrNull } from "../auth.helpers";
import { Id } from "../_generated/dataModel";
import {
  prescriptionStatus,
} from "../validators";
import { api } from "../_generated/api";

/*
 * NOTE ON THE FUNCTION REFERENCES IN THIS FILE
 *
 * Every cross-module call below used to be a STRING cast through `as any`:
 * `ctx.runQuery("pickerAssignment:getNextPickerForVendor" as any, ...)` and
 * `ctx.scheduler.runAfter(0, "notifications:notifyUser" as any, ...)`.
 *
 * Both names were wrong. These modules live at `data/picker_assignment` and
 * `data/notifications`, so the references resolved to nothing and every call
 * threw at runtime - and the `as any` meant the type checker could not say so.
 * The prescription path swallowed the throw in a catch that still returned
 * `success: true`, so an upload appeared to work while no picker was ever
 * assigned and no notification was ever sent.
 *
 * Typed references now. If a module moves, this stops compiling instead of
 * silently doing nothing.
 */


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
      await ctx.scheduler.runAfter(0, api.data.notifications.notifyUser, {
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
    status: v.union(...prescriptionStatus.map((e) => v.literal(e))),
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
    await ctx.scheduler.runAfter(0, api.data.notifications.notifyUser, {
      userId: prescription.user_id,
      type: "system" as const,
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
    status: v.union(...prescriptionStatus.map((e) => v.literal(e))),
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
    await ctx.scheduler.runAfter(0, api.data.notifications.notifyUser, {
      userId: prescription.user_id,
      type: "system" as const,
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

/** What `assignPrescriptionToPicker` returns. Annotated to break the cycle. */
type AssignmentResult = {
  success: boolean;
  assignedPickerId?: Id<"users">;
} | null;

/**
 * Route a prescription to a picker and tell them about it.
 *
 * Shared by both upload entry points. Failure is REPORTED rather than swallowed:
 * the previous version wrapped this in a catch that still returned
 * `success: true`, so an upload that reached nobody looked identical to one that
 * did — and since the function reference was a wrong string, that was every
 * upload ever made. The customer waited for a verification that had not been
 * requested.
 */
async function routePrescription(
  ctx: MutationCtx,
  prescriptionId: Id<"prescriptions">,
  vendorId: Id<"vendors">,
  customerName: string,
): Promise<{ assigned: boolean; assignedPickerId: Id<"users"> | null }> {
  let result: AssignmentResult = null;
  try {
    result = await ctx.runMutation(
      api.data.picker_assignment.assignPrescriptionToPicker,
      { prescriptionId, vendorId },
    );
  } catch (error) {
    // The one genuine case: no active picker for this vendor. Recorded, not
    // hidden — the prescription still exists and can be picked up manually.
    console.error("prescription assignment failed", { prescriptionId, error });
    return { assigned: false, assignedPickerId: null };
  }

  const pickerId = result?.assignedPickerId ?? null;
  if (!pickerId) return { assigned: false, assignedPickerId: null };

  await ctx.scheduler.runAfter(0, api.data.notifications.notifyUser, {
    userId: pickerId,
    type: "system" as const,
    title: "New prescription to verify",
    message: `A prescription from ${customerName} needs verifying.`,
    data: { prescriptionId, route: "/prescription-verification" },
  });

  return { assigned: true, assignedPickerId: pickerId };
}

/**
 * @deprecated Takes `clerkId` as an argument rather than deriving identity from
 * the auth token, so any client could upload a prescription on another
 * customer's behalf — and a prescription is the document that unblocks a
 * restricted purchase. Use `uploadMyPrescription`.
 */
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
    if (!user) throw new ConvexError("User not found");

    const prescriptionId = await ctx.db.insert("prescriptions", {
      user_id: user._id,
      prescription_document: args.prescriptionDocument,
      status: "pending",
      vendor_id: args.vendorId,
      uploaded_at: Date.now(),
    });

    const routed = await routePrescription(
      ctx,
      prescriptionId,
      args.vendorId,
      user.name ?? `${user.first_name} ${user.last_name}`.trim(),
    );

    return { success: true, prescriptionId, ...routed };
  },
});

/**
 * Upload one of the caller's own prescriptions, for one vendor.
 *
 * ── Why the caller cannot say who they are ───────────────────────────────
 *
 * A prescription is the document that unblocks a restricted purchase. The
 * previous mutation took `clerkId` as an argument, so a client could file a
 * document against somebody else's account — either to unblock their own
 * purchase using another person's paperwork, or to attach a document to a
 * customer who never uploaded one.
 *
 * ── The result names what actually happened ──────────────────────────────
 *
 * `assigned: false` means the prescription was stored but no picker was
 * available to verify it, which the screen says out loud. The old version
 * returned `success: true` in that case, so the customer waited for a review
 * nobody had been asked for.
 */
export const uploadMyPrescription = mutation({
  args: {
    storageId: v.id("_storage"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    // The vendor must exist: a prescription filed against a stray id is
    // invisible to every picker queue.
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError("That shop no longer exists.");

    const prescriptionId = await ctx.db.insert("prescriptions", {
      user_id: user._id,
      prescription_document: args.storageId,
      status: "pending",
      vendor_id: args.vendorId,
      uploaded_at: Date.now(),
    });

    const routed = await routePrescription(
      ctx,
      prescriptionId,
      args.vendorId,
      typeof user.name === "string" && user.name
        ? user.name
        : `${user.first_name} ${user.last_name}`.trim(),
    );

    return { prescriptionId, ...routed };
  },
});

/**
 * One of the caller's own prescriptions, by id.
 *
 * This is what a screen polls after uploading, and it is deliberately keyed on
 * the prescription rather than on the vendor. `getPrescriptionStatus` returns the
 * MOST RECENT prescription for a `{clerkId, vendorId}` pair, so a previously
 * approved document made a brand-new upload report itself approved the instant it
 * was made — the screen closed on an approval that belonged to a different piece
 * of paper.
 */
export const getMyPrescription = query({
  args: { prescriptionId: v.id("prescriptions") },
  handler: async (ctx, args) => {
    const caller = await getAuthUserOrNull(ctx);
    if (!caller) return null;

    const prescription = await ctx.db.get(args.prescriptionId);
    // Same answer for somebody else's prescription as for a missing one.
    if (!prescription || prescription.user_id !== caller.user._id) return null;

    return {
      _id: prescription._id,
      status: prescription.status,
      vendorId: prescription.vendor_id,
      uploadedAt: prescription.uploaded_at,
      // The table stores a rejection REASON ID, not text. Resolved below so the
      // screen can show why rather than an opaque id — there is no `verified_at`
      // or `rejection_reason` column, whatever the old code assumed.
      rejectionReasonId: prescription.rejection_reason_id ?? null,
      notes: prescription.notes ?? null,
      assigned: !!prescription.assigned_picker_id,
    };
  },
});

/**
 * The caller's latest prescription per vendor, for a set of vendors.
 *
 * Used by checkout to decide which shops in the basket still need paperwork.
 * `uploadedAt` is returned so a screen can tell an approval filed months ago
 * apart from one filed for this basket — the distinction the vendor-keyed query
 * could not express.
 */
export const getMyPrescriptionsByVendor = query({
  args: { vendorIds: v.array(v.id("vendors")) },
  handler: async (ctx, args) => {
    const caller = await getAuthUserOrNull(ctx);
    if (!caller) return [];

    // Bounded by the number of shops in a basket, and capped so a crafted
    // request cannot fan out.
    const vendorIds = args.vendorIds.slice(0, 25);

    const mine = await ctx.db
      .query("prescriptions")
      .withIndex("by_user", (q) => q.eq("user_id", caller.user._id))
      .order("desc")
      .take(100);

    return vendorIds.map((vendorId) => {
      const latest = mine.find((p) => p.vendor_id === vendorId);
      return {
        vendorId,
        prescriptionId: latest?._id ?? null,
        status: latest?.status ?? null,
        uploadedAt: latest?.uploaded_at ?? null,
        rejectionReasonId: latest?.rejection_reason_id ?? null,
      };
    });
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

// ---------------------------------------------------------------------------
// Order item <-> prescription
// ---------------------------------------------------------------------------

/**
 * The prescription authorising a specific order item, with its document URL.
 *
 * Before `order_items.prescription_id` existed, a picker could be told an item
 * required a prescription check but not which document to check: prescriptions
 * are keyed by customer + vendor, so an order with two prescription items and
 * two uploaded documents was ambiguous. This resolves the link directly.
 *
 * Returns null when the item has no link, which is the case for every row
 * created before the field was added — `backfillOrderItemPrescriptions` fills
 * those in, and callers should fall back to the picker's pending queue.
 */
export const getPrescriptionForOrderItem = query({
  args: { itemId: v.id("order_items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item?.prescription_id) return null;

    const prescription = await ctx.db.get(item.prescription_id);
    if (!prescription) return null;

    const [documentUrl, customer] = await Promise.all([
      ctx.storage.getUrl(prescription.prescription_document),
      ctx.db.get(prescription.user_id),
    ]);

    return {
      ...prescription,
      documentUrl,
      customer_name: customer
        ? `${customer.first_name} ${customer.last_name}`.trim()
        : undefined,
      item: {
        _id: item._id,
        name: item.name,
        quantity: item.quantity,
        order_id: item.order_id,
      },
    };
  },
});

/**
 * The items a prescription authorises, so a review screen can name what it is
 * approving rather than showing a bare image.
 *
 * Uses the `by_prescription` index; returns an empty array for a prescription
 * whose order predates the link.
 */
export const getOrderItemsForPrescription = query({
  args: { prescriptionId: v.id("prescriptions") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("order_items")
      .withIndex("by_prescription", (q) =>
        q.eq("prescription_id", args.prescriptionId),
      )
      .collect();

    const orderIds = [...new Set(items.map((i) => i.order_id))];
    const orders = await Promise.all(orderIds.map((id) => ctx.db.get(id)));
    const referenceById = new Map(
      orders.filter((o) => o !== null).map((o) => [o!._id, o!.reference]),
    );

    return items.map((item) => ({
      _id: item._id,
      name: item.name,
      quantity: item.quantity,
      order_id: item.order_id,
      order_reference: referenceById.get(item.order_id),
    }));
  },
});

/**
 * Backfills `prescription_id` on order items created before the field existed.
 *
 * Paginated and idempotent, per the migration rules: never `.collect()` the
 * whole table (the 16k-document read ceiling is a hard throw, not a slowdown),
 * and safe to re-run. Returns a cursor so a caller can drive it to completion,
 * and reports what it could not resolve rather than guessing.
 *
 * Internal, not public: it is a migration that writes, and nothing in any app
 * should be able to trigger it. An operator still runs it with
 * `npx convex run data/prescriptions:backfillOrderItemPrescriptions`, which
 * works for internal functions.
 *
 * The resolution is the same one the finalizers make: the approved prescription
 * for this order's customer and vendor. Where a customer has more than one
 * approved prescription with that vendor, the OLDEST is chosen — it is the one
 * that existed when the order was placed. That is a heuristic, and it is why
 * this reports `ambiguous` separately: those rows are worth a human look.
 */
export const backfillOrderItemPrescriptions = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.min(args.batchSize ?? 200, 500);

    const page = await ctx.db
      .query("order_items")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let linked = 0;
    let skipped = 0;
    let ambiguous = 0;
    let unresolved = 0;

    for (const item of page.page) {
      if (!item.requires_prescription || item.prescription_id) {
        skipped++;
        continue;
      }

      const order = await ctx.db.get(item.order_id);
      if (!order) {
        unresolved++;
        continue;
      }

      const approved = await ctx.db
        .query("prescriptions")
        .withIndex("by_user", (q) => q.eq("user_id", order.user_id))
        .filter((q) =>
          q.and(
            q.eq(q.field("vendor_id"), order.vendor_id),
            q.eq(q.field("status"), "approved"),
          ),
        )
        .collect();

      if (approved.length === 0) {
        unresolved++;
        continue;
      }
      if (approved.length > 1) ambiguous++;

      const oldest = approved.reduce((a, b) =>
        a.uploaded_at <= b.uploaded_at ? a : b,
      );
      await ctx.db.patch(item._id, { prescription_id: oldest._id });
      linked++;
    }

    return {
      linked,
      skipped,
      ambiguous,
      unresolved,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});
