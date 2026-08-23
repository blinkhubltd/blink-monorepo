import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { OrderItemUpdateValidator, OrdersValidator } from "./validators";
import { getUserByClerkId } from "./helpers";
import { syncShipmentStatusForOrder } from "./helpers/statusSync";
import { generateDeliveryCode as createDeliveryCode } from "./hooks";

const computeOrderSearchText = (order: {
  reference?: string;
  payment_reference?: string;
  delivery_code?: string;
  receiver_contact?: { name?: string; phone?: string; email?: string };
  customer?: { name?: string; email?: string; phone?: string } | null;
  vendor?: { name?: string } | null;
}) => {
  return [
    order.reference ?? "",
    order.payment_reference ?? "",
    order.delivery_code ?? "",
    order.receiver_contact?.name ?? "",
    order.receiver_contact?.phone ?? "",
    order.receiver_contact?.email ?? "",
    order.customer?.name ?? "",
    order.customer?.email ?? "",
    order.customer?.phone ?? "",
    order.vendor?.name ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

export const paginateOrders = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    order_status: v.optional(
      v.union(
        v.literal("Pending"),
        v.literal("Confirmed"),
        v.literal("Processing"),
        v.literal("Pickup"),
        v.literal("Delivery"),
        v.literal("Delivered"),
        v.literal("Cancelled"),
        v.literal("Refunded"),
      ),
    ),
    payment_status: v.optional(
      v.union(v.literal("Unpaid"), v.literal("Paid"), v.literal("Refunded")),
    ),
    vendor_id: v.optional(v.id("vendors")),
    vendor_ids: v.optional(v.array(v.id("vendors"))),
    assigned_picker_id: v.optional(v.id("users")),
    is_clearance: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const PageLimit = Math.max(1, Math.min(200, args.limit));
    const normalizedSearch = (args.search ?? "").trim();
    const isSearching = normalizedSearch.length > 0;

    // If vendor_ids is provided with a single ID and no vendor_id, use it as vendor_id
    const effectiveVendorId =
      args.vendor_id ??
      (args.vendor_ids?.length === 1 ? args.vendor_ids[0] : undefined);
    const vendorIdsFilter =
      !effectiveVendorId && args.vendor_ids && args.vendor_ids.length > 1
        ? args.vendor_ids
        : undefined;

    const baseQuery = ctx.db.query("orders");

    let ordersQuery;
    if (isSearching) {
      ordersQuery = baseQuery.withSearchIndex("search_text", (q) => {
        let sq = q.search("searchText", normalizedSearch);
        if (effectiveVendorId) {
          sq = sq.eq("vendor_id", effectiveVendorId);
        }
        if (args.order_status) {
          sq = sq.eq("order_status", args.order_status);
        }
        if (args.payment_status) {
          sq = sq.eq("payment_status", args.payment_status);
        }
        return sq;
      });
    } else if (args.assigned_picker_id && args.order_status) {
      ordersQuery = baseQuery
        .withIndex("by_assigned_picker_status", (q) =>
          q
            .eq("assigned_picker_id", args.assigned_picker_id!)
            .eq("order_status", args.order_status!),
        )
        .order("desc");
    } else if (args.assigned_picker_id) {
      ordersQuery = baseQuery
        .withIndex("by_assigned_picker", (q) =>
          q.eq("assigned_picker_id", args.assigned_picker_id!),
        )
        .order("desc");
    } else if (args.order_status && effectiveVendorId) {
      ordersQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("order_status", args.order_status!))
        .filter((q) => q.eq(q.field("vendor_id"), effectiveVendorId!))
        .order("desc");
    } else if (args.order_status && args.payment_status) {
      ordersQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("order_status", args.order_status!))
        .filter((q) => q.eq(q.field("payment_status"), args.payment_status!))
        .order("desc");
    } else if (args.order_status) {
      ordersQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("order_status", args.order_status!))
        .order("desc");
    } else if (args.payment_status) {
      ordersQuery = baseQuery
        .withIndex("by_payment_status", (q) =>
          q.eq("payment_status", args.payment_status!),
        )
        .order("desc");
    } else if (effectiveVendorId) {
      ordersQuery = baseQuery
        .withIndex("by_vendor", (q) => q.eq("vendor_id", effectiveVendorId!))
        .order("desc");
    } else {
      ordersQuery = baseQuery.order("desc");
    }

    // Apply multi-vendor filter when vendor_ids has multiple IDs
    if (vendorIdsFilter) {
      const vendorSet = new Set(vendorIdsFilter);
      ordersQuery = ordersQuery.filter((q: any) =>
        q.or(
          ...vendorIdsFilter.map((id: any) => q.eq(q.field("vendor_id"), id)),
        ),
      );
    }

    // Filter by clearance orders
    if (args.is_clearance !== undefined) {
      ordersQuery = ordersQuery.filter((q: any) =>
        q.eq(q.field("is_clearance"), args.is_clearance),
      );
    }

    const pageResult = await ordersQuery.paginate({
      cursor: args.cursor ?? null,
      numItems: PageLimit,
    });

    const currentPageOrders = pageResult.page;

    const total = (() => {
      let countQuery;
      if (isSearching) {
        countQuery = baseQuery.withSearchIndex("search_text", (q) => {
          let sq = q.search("searchText", normalizedSearch);
          if (effectiveVendorId) {
            sq = sq.eq("vendor_id", effectiveVendorId);
          }
          if (args.order_status) {
            sq = sq.eq("order_status", args.order_status);
          }
          if (args.payment_status) {
            sq = sq.eq("payment_status", args.payment_status);
          }
          return sq;
        });
      } else if (args.assigned_picker_id && args.order_status) {
        countQuery = baseQuery.withIndex("by_assigned_picker_status", (q) =>
          q
            .eq("assigned_picker_id", args.assigned_picker_id!)
            .eq("order_status", args.order_status!),
        );
      } else if (args.assigned_picker_id) {
        countQuery = baseQuery.withIndex("by_assigned_picker", (q) =>
          q.eq("assigned_picker_id", args.assigned_picker_id!),
        );
      } else if (args.order_status) {
        countQuery = baseQuery.withIndex("by_status", (q) =>
          q.eq("order_status", args.order_status!),
        );
      } else if (args.payment_status) {
        countQuery = baseQuery.withIndex("by_payment_status", (q) =>
          q.eq("payment_status", args.payment_status!),
        );
      } else if (effectiveVendorId) {
        countQuery = baseQuery.withIndex("by_vendor", (q) =>
          q.eq("vendor_id", effectiveVendorId!),
        );
      } else {
        countQuery = baseQuery;
      }
      if (vendorIdsFilter) {
        countQuery = countQuery.filter((q: any) =>
          q.or(
            ...vendorIdsFilter.map((id: any) => q.eq(q.field("vendor_id"), id)),
          ),
        );
      }
      return countQuery.collect();
    })();

    const totalCount = (await total).length;

    const totalPages = Math.max(1, Math.ceil(totalCount / PageLimit));

    // Enrich orders with customer and vendor data
    const enrichedOrders = await Promise.all(
      currentPageOrders.map(async (order) => {
        // Get customer data
        const customer = await ctx.db.get(order.user_id);

        // Get vendor data
        const vendor = await ctx.db.get(order.vendor_id);

        // Get rider data if assigned
        let rider = null;
        if (order.rider_id) {
          rider = await ctx.db.get(order.rider_id);
        }

        // Get picker data if assigned
        let picker = null;
        if (order.assigned_picker_id) {
          picker = await ctx.db.get(order.assigned_picker_id);
        }

        return {
          ...order,
          customer_name:
            customer?.name || customer?.first_name
              ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
              : customer?.email?.split("@")[0],
          customer_email: customer?.email,
          customer_phone: customer?.phone,
          vendor_name: vendor?.name,
          rider_name:
            rider?.name || rider?.first_name
              ? `${rider.first_name || ""} ${rider.last_name || ""}`.trim()
              : rider?.email?.split("@")[0],
          picker_name:
            picker?.name || picker?.first_name
              ? `${picker.first_name || ""} ${picker.last_name || ""}`.trim()
              : picker?.email?.split("@")[0],
        };
      }),
    );

    return {
      data: enrichedOrders,
      pagination: {
        PageLimit,
        total: totalCount,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const backfillOrdersSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();
    let updatedCount = 0;

    for (const order of orders) {
      const [customer, vendor] = await Promise.all([
        ctx.db.get(order.user_id),
        ctx.db.get(order.vendor_id),
      ]);

      const customerName = customer
        ? customer.name ||
          `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
        : "";

      const searchText = computeOrderSearchText({
        ...order,
        customer: customer
          ? {
              name: customerName,
              email: customer.email,
              phone: customer.phone,
            }
          : null,
        vendor: vendor ? { name: vendor.name } : null,
      });

      if (order.searchText === searchText) continue;
      await ctx.db.patch(order._id, { searchText, updated_at: Date.now() });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const getOrderById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orderId);
  },
});

export const createOrder = mutation({
  args: { order: OrdersValidator },
  handler: async (ctx, args) => {
    const now = Date.now();
    const order = { ...args.order };
    // Default payment_mode to pay_now if not provided
    order.payment_mode = order.payment_mode || "pay_now";
    // Set initial status based on payment_mode
    if (order.payment_mode === "pay_on_delivery") {
      order.order_status = "Confirmed";
      order.payment_status = "Unpaid";
      // No delivery_code for pay_on_delivery
      order.delivery_code = undefined;
      order.delivery_code_verified = false;
    } else {
      // pay_now
      order.order_status = "Pending";
      order.payment_status = "Unpaid";
      order.delivery_code = undefined;
      order.delivery_code_verified = false;
    }
    const [customer, vendor] = await Promise.all([
      ctx.db.get(order.user_id),
      ctx.db.get(order.vendor_id),
    ]);

    const customerName = customer
      ? customer.name ||
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
      : "";

    order.searchText = computeOrderSearchText({
      ...order,
      customer: customer
        ? {
            name: customerName,
            email: customer.email,
            phone: customer.phone,
          }
        : null,
      vendor: vendor ? { name: vendor.name } : null,
    });

    order.updated_at = now;
    await ctx.db.insert("orders", order);
  },
});

export const listOrders = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { userId, limit = 10, cursor } = args;

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    if (userId !== undefined) {
      const result = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .paginate({
          numItems: safeLimit,
          cursor: cursor || null,
        });

      return result;
    }

    const result = await ctx.db
      .query("orders")
      .order("desc")
      .paginate({
        numItems: safeLimit,
        cursor: cursor || null,
      });

    return result;
  },
});

export const listOrdersFiltered = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("Pending"),
        v.literal("Confirmed"),
        v.literal("Processing"),
        v.literal("Pickup"),
        v.literal("Delivery"),
        v.literal("Delivered"),
        v.literal("Cancelled"),
        v.literal("Refunded"),
      ),
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, status, limit = 10, cursor } = args;

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const paginationOpts = {
      numItems: safeLimit,
      cursor: cursor || null,
    };

    if (userId !== undefined && status !== undefined) {
      return await ctx.db
        .query("orders")
        .withIndex("by_user_status", (q) =>
          q.eq("user_id", userId).eq("order_status", status),
        )
        .paginate(paginationOpts);
    }

    if (userId !== undefined) {
      return await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .paginate(paginationOpts);
    }

    if (status !== undefined) {
      return await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("order_status", status))
        .paginate(paginationOpts);
    }

    return await ctx.db.query("orders").paginate(paginationOpts);
  },
});

export const updateOrder = mutation({
  args: { id: v.id("orders"), OrderItemUpdateValidator },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.OrderItemUpdateValidator);
    return await ctx.db.get(args.id);
  },
});

export const deleteOrder = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return {
      success: true,
    };
  },
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("Pending"),
      v.literal("Confirmed"),
      v.literal("Processing"),
      v.literal("Pickup"),
      v.literal("Delivery"),
      v.literal("Delivered"),
      v.literal("Cancelled"),
      v.literal("Refunded"),
    ),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Update order status
    await ctx.db.patch(args.orderId, {
      order_status: args.status,
      updated_at: Date.now(),
      // Capture timestamps for pickup duration tracking
      ...(args.status === "Confirmed" && !order.confirmed_at
        ? { confirmed_at: Date.now() }
        : {}),
      ...(args.status === "Pickup" ? { picked_up_at: Date.now() } : {}),
    });

    // For Delivery / Delivered trigger notification pipeline if called directly via admin panel
    if (args.status === "Delivery" || args.status === "Delivered") {
      try {
        console.log(
          "[updateOrderStatus] scheduling triggerOrderStatusNotification",
          {
            orderId: args.orderId,
            status: args.status,
            previousStatus: order.order_status,
            invokedFrom: "orders.updateOrderStatus",
          },
        );
        await ctx.scheduler.runAfter(
          0,
          api.notifications.triggerOrderStatusNotification,
          {
            orderId: args.orderId,
            newStatus: args.status,
            previousStatus: order.order_status,
          },
        );
      } catch (e) {
        console.error(
          "[updateOrderStatus] failed to schedule status notification",
          e,
        );
      }
    }

    try {
      await syncShipmentStatusForOrder(ctx, args.orderId, args.status);
    } catch (syncError) {
      console.error(
        `Shipment status sync failed for order ${args.orderId}:`,
        syncError,
      );
    }

    // Handle stock fulfillment when order is delivered or in transit
    if (
      (args.status === "Delivered" || args.status === "Delivery") &&
      order.payment_reference
    ) {
      try {
        // Call the stock fulfillment function
        await ctx.runMutation(api.stockReservation.fulfillStock, {
          orderReference: order.payment_reference,
        });
        console.log(
          `Stock reservation marked as fulfilled for order ${args.orderId} - inventory managed by external API`,
        );
      } catch (stockError) {
        console.error(
          `Stock fulfillment failed for order ${args.orderId}:`,
          stockError,
        );
      }
    }

    // Handle stock release when order is cancelled or refunded
    if (
      (args.status === "Cancelled" || args.status === "Refunded") &&
      order.payment_reference
    ) {
      try {
        // Call the stock release function
        await ctx.runMutation(api.stockReservation.releaseStock, {
          orderReference: order.payment_reference,
        });
        console.log(
          `Stock released for cancelled/refunded order ${args.orderId} with reference ${order.payment_reference}`,
        );
      } catch (stockError) {
        console.error(
          `Stock release failed for order ${args.orderId}:`,
          stockError,
        );
        // Don't throw error - order status update should still succeed
      }
    }

    return await ctx.db.get(args.orderId);
  },
});

export const finalizePicking = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // Only advance if current status is one of pre-delivery states
    const preDeliveryStates = new Set([
      "Pending",
      "Confirmed",
      "Processing",
      "Pickup",
    ]);
    if (!preDeliveryStates.has(order.order_status)) {
      return { advanced: false, reason: "ALREADY_PAST_PICKING" };
    }

    await ctx.db.patch(args.orderId, {
      order_status: "Delivery", // Rider en route
      updated_at: Date.now(),
    });

    // Schedule status notification trigger (Delivery state) using unified path
    try {
      await ctx.scheduler.runAfter(
        0,
        api.notifications.triggerOrderStatusNotification,
        {
          orderId: args.orderId,
          newStatus: "Delivery",
          previousStatus: order.order_status,
        },
      );
    } catch (e) {
      console.error("Failed to schedule delivery status notification", e);
    }

    // Sync shipment to Out for Delivery
    try {
      const syncResult = await syncShipmentStatusForOrder(
        ctx,
        args.orderId,
        "Delivery",
      );
      return { advanced: true, syncResult };
    } catch (e) {
      console.error("Shipment sync failed during finalizePicking", e);
      return { advanced: true, syncError: true };
    }
  },
});

export const updatePaymentStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("Unpaid"),
      v.literal("Paid"),
      v.literal("Refunded"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      payment_status: args.status,
      updated_at: Date.now(),
    });

    // Note: For the main payment flow, delivery code generation is handled
    // in payments.ts during verifyPaystack() to avoid duplication.
    // This mutation is for manual/administrative payment status updates.

    return {
      message: "Payment status updated successfully",
    };
  },
});

// Generate delivery code for pay_now orders
export const generateDeliveryCode = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Only generate for pay_now orders that are paid
    if (order.payment_mode !== "pay_now" || order.payment_status !== "Paid") {
      throw new ConvexError(
        "Delivery code only applicable for paid pay_now orders",
      );
    }

    // Check if code already exists and is valid
    if (order.delivery_code && !order.delivery_code_verified) {
      return { code: order.delivery_code, regenerated: false };
    }

    const delivery_code = createDeliveryCode();
    await ctx.db.patch(args.orderId, {
      delivery_code,
      delivery_code_verified: false,
      updated_at: Date.now(),
    });

    // Send the code to customer
    try {
      await ctx.scheduler.runAfter(0, api.notifications.sendDeliveryCode, {
        orderId: args.orderId,
        code: delivery_code,
        userId: order.user_id,
        riderId: order.rider_id,
        resend: !!order.delivery_code, // true if this is a regeneration
      });
    } catch (error) {
      console.error("Failed to send delivery code notification:", error);
    }

    return { code: delivery_code, regenerated: !!order.delivery_code };
  },
});

// Verify delivery code
export const verifyDeliveryCode = mutation({
  args: {
    orderId: v.id("orders"),
    code: v.string(),
    riderId: v.optional(v.id("users")), // for rider verification
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Only applicable for pay_now orders
    if (order.payment_mode !== "pay_now") {
      throw new ConvexError(
        "Delivery code verification only applicable for pay_now orders",
      );
    }

    // Check if code matches
    if (order.delivery_code !== args.code) {
      return { verified: false, reason: "invalid_code" };
    }

    // Check if already verified
    if (order.delivery_code_verified) {
      return { verified: true, reason: "already_verified" };
    }

    // Mark as verified
    await ctx.db.patch(args.orderId, {
      delivery_code_verified: true,
      updated_at: Date.now(),
    });

    // Update order status to delivered if not already
    if (order.order_status !== "Delivered") {
      await ctx.runMutation(api.orders.updateOrderStatus, {
        orderId: args.orderId,
        status: "Delivered",
      });
    }

    return { verified: true, reason: "success" };
  },
});

// Resend delivery code
export const resendDeliveryCode = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.payment_mode !== "pay_now" || !order.delivery_code) {
      throw new ConvexError("No delivery code to resend");
    }

    if (order.delivery_code_verified) {
      throw new ConvexError("Delivery code already verified");
    }

    // Send the existing code again
    try {
      await ctx.scheduler.runAfter(0, api.notifications.sendDeliveryCode, {
        orderId: args.orderId,
        code: order.delivery_code,
        userId: order.user_id,
        riderId: order.rider_id,
        resend: true,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to resend delivery code:", error);
      throw new Error("Failed to resend delivery code");
    }
  },
});

// Get orders requiring delivery code verification
export const getOrdersAwaitingVerification = query({
  args: {
    riderId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit || 50, 100);

    let ordersQuery = ctx.db
      .query("orders")
      .withIndex("by_delivery_code_verified", (q) =>
        q.eq("delivery_code_verified", false),
      );

    if (args.riderId) {
      // Filter by rider if specified
      const allOrders = await ordersQuery.collect();
      const riderOrders = allOrders.filter(
        (order) => order.rider_id === args.riderId,
      );
      return riderOrders.slice(0, limit);
    }

    return await ordersQuery.take(limit);
  },
});

// Check delivery code without verifying (for UI validation)
export const checkDeliveryCode = query({
  args: {
    orderId: v.id("orders"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      return { valid: false, reason: "order_not_found" };
    }

    if (order.payment_mode !== "pay_now") {
      return { valid: false, reason: "not_pay_now_order" };
    }

    if (!order.delivery_code) {
      return { valid: false, reason: "no_code_generated" };
    }

    if (order.delivery_code_verified) {
      return { valid: false, reason: "already_verified" };
    }

    const isValid = order.delivery_code === args.code;
    return {
      valid: isValid,
      reason: isValid ? "valid" : "invalid_code",
    };
  },
});

export const bulkUpdateOrderStatus = mutation({
  args: {
    orderIds: v.array(v.id("orders")),
    status: v.union(
      v.literal("Pending"),
      v.literal("Confirmed"),
      v.literal("Processing"),
      v.literal("Pickup"),
      v.literal("Delivery"),
      v.literal("Delivered"),
      v.literal("Cancelled"),
      v.literal("Refunded"),
    ),
  },
  handler: async (ctx, args) => {
    const { orderIds, status } = args;

    // Update all orders with timestamps
    const updatePromises = orderIds.map(async (orderId) => {
      const order = await ctx.db.get(orderId);
      await ctx.db.patch(orderId, {
        order_status: status,
        updated_at: Date.now(),
        ...(status === "Confirmed" && !order?.confirmed_at
          ? { confirmed_at: Date.now() }
          : {}),
        ...(status === "Pickup" ? { picked_up_at: Date.now() } : {}),
      });
    });

    await Promise.all(updatePromises);

    // Return updated orders
    const updatedOrders = await Promise.all(
      orderIds.map((orderId) => ctx.db.get(orderId)),
    );

    return {
      success: true,
      updatedCount: orderIds.length,
      updatedOrders: updatedOrders.filter((order) => order !== null),
    };
  },
});

// Get orders with customer data and order items (for the table display)
export const listOrdersWithDetails = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("Pending"),
        v.literal("Confirmed"),
        v.literal("Processing"),
        v.literal("Pickup"),
        v.literal("Delivery"),
        v.literal("Delivered"),
        v.literal("Cancelled"),
        v.literal("Refunded"),
      ),
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, status, limit = 10, cursor } = args;

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const paginationOpts = {
      numItems: safeLimit,
      cursor: cursor || null,
    };

    let ordersResult;

    // Get orders based on filters (same logic as listOrdersFiltered)
    if (userId !== undefined && status !== undefined) {
      ordersResult = await ctx.db
        .query("orders")
        .withIndex("by_user_status", (q) =>
          q.eq("user_id", userId).eq("order_status", status),
        )
        .paginate(paginationOpts);
    } else if (userId !== undefined) {
      ordersResult = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("user_id", userId))
        .paginate(paginationOpts);
    } else if (status !== undefined) {
      ordersResult = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("order_status", status))
        .paginate(paginationOpts);
    } else {
      ordersResult = await ctx.db.query("orders").paginate(paginationOpts);
    }

    // Enrich orders with customer data and order items
    const enrichedOrders = await Promise.all(
      ordersResult.page.map(async (order) => {
        const [customer, orderItems] = await Promise.all([
          ctx.db.get(order.user_id),
          ctx.db
            .query("order_items")
            .withIndex("by_order", (q) => q.eq("order_id", order._id))
            .collect(),
        ]);

        // Get vendor name from the first order item (assuming single vendor per order)
        const vendorName =
          orderItems.length > 0 && orderItems[0].vendor_id
            ? orderItems[0].name.split(" ")[0] // Extract vendor info from item name or use a different approach
            : "Multiple Vendors";

        const name = `${customer?.first_name} ${customer?.last_name}`;

        return {
          ...order,
          customer_name: name || "Unknown Customer",
          vendor_name: vendorName,
          order_items: orderItems,
          items_count: orderItems.length,
        };
      }),
    );

    return {
      ...ordersResult,
      page: enrichedOrders,
    };
  },
});

export const getOrders = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();

    // Enrich with customer data and order items
    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        const [customer, vendors, orderItems] = await Promise.all([
          ctx.db.get(order.user_id),
          ctx.db.get(order.vendor_id),
          ctx.db
            .query("order_items")
            .withIndex("by_order", (q) => q.eq("order_id", order._id))
            .collect(),
        ]);

        // Fetch product details for each order item
        const enrichedOrderItems = await Promise.all(
          orderItems.map(async (item) => {
            const product = await ctx.db.get(item.product_id);
            return {
              ...item,
              product: product || null, // Include the full product object
            };
          }),
        );

        const name = `${customer?.first_name} ${customer?.last_name}`;

        return {
          ...order,
          customer_name: name,
          customer_email: customer?.email || "No email",
          customer_phone: customer?.phone || "No phone",
          vendor_name: vendors?.name,
          vendor_contact: vendors?.contact,
          order_items: enrichedOrderItems,
          items_count: enrichedOrderItems.length,
        };
      }),
    );

    return enrichedOrders;
  },
});

export const getOrderItems = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("order_items")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .collect();
  },
});

// Get order with full details, including customer and items
export const getOrderWithItems = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const [customer, vendor, orderItems] = await Promise.all([
      ctx.db.get(order.user_id),
      ctx.db.get(order.vendor_id),
      ctx.db
        .query("order_items")
        .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
        .collect(),
    ]);
    const name = `${customer?.first_name} ${customer?.last_name}`;

    return {
      ...order,
      vendor_name: vendor?.name,
      vendor_contact: vendor?.contact,
      customer_name: name || "Unknown Customer",
      customer_email: customer?.email,
      customer_phone: customer?.phone,
      order_items: orderItems,
      items_count: orderItems.length,
    };
  },
});

export const validateOrderExists = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    return { exists: order !== null, order };
  },
});

// Get order statistics
export const getOrderStats = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();

    const stats = {
      total: orders.length,
      byStatus: {} as Record<string, number>,
      byPaymentStatus: {} as Record<string, number>,
      deliveryCodeStats: {
        total_pay_now: 0,
        codes_generated: 0,
        codes_verified: 0,
        pending_verification: 0,
      },
      totalRevenue: 0,
    };

    orders.forEach((order) => {
      // Count by order status
      stats.byStatus[order.order_status] =
        (stats.byStatus[order.order_status] || 0) + 1;

      // Count by payment status
      stats.byPaymentStatus[order.payment_status] =
        (stats.byPaymentStatus[order.payment_status] || 0) + 1;

      // Delivery code statistics
      if (order.payment_mode === "pay_now") {
        stats.deliveryCodeStats.total_pay_now++;

        if (order.delivery_code) {
          stats.deliveryCodeStats.codes_generated++;

          if (order.delivery_code_verified) {
            stats.deliveryCodeStats.codes_verified++;
          } else {
            stats.deliveryCodeStats.pending_verification++;
          }
        }
      }

      // Calculate total revenue (only for paid orders)
      if (order.payment_status === "Paid") {
        stats.totalRevenue += order.total_amount;
      }
    });

    return stats;
  },
});

export const assignRider = mutation({
  args: {
    orderId: v.id("orders"),
    riderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      rider_id: args.riderId,
      updated_at: Date.now(),
    });

    const order = await ctx.db.get(args.orderId);

    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .first();

    if (!shipment && order) {
      const vendor = await ctx.db.get(order.vendor_id);

      await ctx.db.insert("shipments", {
        order_id: args.orderId,
        vendor_id: order?.vendor_id,
        pickup_address: vendor?.address || {},
        delivery_address: order.address || {},
        rider_id: args.riderId,
        updated_at: Date.now(),
        status: "Awaiting Pickup",
      });
    }

    try {
      await ctx.scheduler.runAfter(0, api.notifications.notifyRiderAssignment, {
        riderId: args.riderId,
        orderId: args.orderId,
        shipmentId: shipment?._id,
      });
    } catch (error) {
      console.error("Failed to schedule rider assignment notification:", error);
      // Don't fail the assignment if notification scheduling fails
    }

    return {
      success: true,
    };
  },
});

export const getUserOrders = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First find the user by clerkId
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);

      const orders = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .order("desc")
        .collect();

      // Enrich with vendor data and order items (same as getOrders function)
      const enrichedOrders = await Promise.all(
        orders.map(async (order) => {
          const [vendor, orderItems] = await Promise.all([
            ctx.db.get(order.vendor_id),
            ctx.db
              .query("order_items")
              .withIndex("by_order", (q) => q.eq("order_id", order._id))
              .collect(),
          ]);

          // Fetch product details for each order item
          const enrichedOrderItems = await Promise.all(
            orderItems.map(async (item) => {
              const product = await ctx.db.get(item.product_id);

              // Process product image if product exists
              let processedProduct = null;
              if (product) {
                const image =
                  product.images && product.images.length > 0
                    ? await ctx.storage.getUrl(product.images[0])
                    : null;
                processedProduct = { ...product, image };
              }

              return {
                ...item,
                product: processedProduct, // Include the processed product object with image URL
              };
            }),
          );

          const customerName = `${user.first_name} ${user.last_name}`;

          return {
            ...order,
            customer_name: customerName,
            customer_email: user.email || "No email",
            customer_phone: user.phone || "No phone",
            vendor_name: vendor?.name,
            vendor_contact: vendor?.contact,
            order_items: enrichedOrderItems,
            items_count: enrichedOrderItems.length,
          };
        }),
      );

      return enrichedOrders;
    } catch (error) {
      // If user not found, return empty array
      return [];
    }
  },
});

export const getUserOrdersPaginated = query({
  args: {
    clerkId: v.string(),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);
      const limit = Math.max(1, Math.min(50, args.limit));

      const pageResult = await ctx.db
        .query("orders")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .order("desc")
        .paginate({
          cursor: args.cursor ?? null,
          numItems: limit,
        });

      const currentPageOrders = pageResult.page;
      const total = (
        await ctx.db
          .query("orders")
          .withIndex("by_user", (q) => q.eq("user_id", user._id))
          .collect()
      ).length;

      // Enrich with vendor data and order items
      const enrichedOrders = await Promise.all(
        currentPageOrders.map(async (order) => {
          // Get vendor information
          const vendor = order.vendor_id
            ? await ctx.db.get(order.vendor_id)
            : null;

          // Get order items with product details
          const orderItems = await ctx.db
            .query("order_items")
            .withIndex("by_order", (q) => q.eq("order_id", order._id))
            .collect();

          const enrichedOrderItems = await Promise.all(
            orderItems.map(async (item) => {
              const product = await ctx.db.get(item.product_id);

              // Process product image if product exists
              let processedProduct = null;
              if (product) {
                const image =
                  product.images && product.images.length > 0
                    ? await ctx.storage.getUrl(product.images[0])
                    : null;
                processedProduct = {
                  ...product,
                  image,
                  images: product.images || [],
                };
              }

              return {
                ...item,
                product: processedProduct, // Include the processed product object with image URL
              };
            }),
          );

          return {
            ...order,
            vendor,
            order_items: enrichedOrderItems,
            items_count: enrichedOrderItems.length,
            customer_name: user.name,
            customer_email: user.email,
            customer_phone: user.phone || null,
          };
        }),
      );

      const totalPages = Math.max(1, Math.ceil(total / limit));

      return {
        data: enrichedOrders,
        pagination: {
          limit,
          total,
          totalPages,
          hasNext: !pageResult.isDone,
          cursor: pageResult.continueCursor ?? null,
        },
      };
    } catch (error) {
      return {
        data: [],
        pagination: {
          limit: args.limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          cursor: null,
        },
      };
    }
  },
});

// ─── Clearance Order ────────────────────────────────────────────────────────────

export const createClearanceOrder = mutation({
  args: {
    order: OrdersValidator,
    clearance_items: v.array(
      v.object({
        clearance_product_id: v.id("clearance_products"),
        quantity: v.number(),
        clearance_price: v.float64(),
        original_price: v.float64(),
        discount_percentage: v.float64(),
        name: v.string(),
        sku: v.string(),
        vendor_id: v.id("vendors"),
        unit_type: v.optional(v.string()),
        unit_value: v.optional(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Mark order as clearance
    const orderData = {
      ...args.order,
      is_clearance: true,
      payment_mode: (args.order.payment_mode ?? "pay_now") as
        | "pay_now"
        | "pay_on_delivery",
      searchText: "",
    };

    const [clearanceDeliverySetting, extraVendorSetting] = await Promise.all([
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "clearance_delivery_fee"))
        .first(),
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "clearance_extra_vendor_fee"))
        .first(),
    ]);

    const parseNonNegative = (raw: string | undefined, fallback: number) => {
      const parsed = Number.parseFloat(raw ?? "");
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };

    const baseClearanceDeliveryFee = parseNonNegative(
      clearanceDeliverySetting?.value,
      150,
    );
    const extraVendorFee = parseNonNegative(extraVendorSetting?.value, 50);
    const vendorCount = new Set(args.clearance_items.map((i) => i.vendor_id))
      .size;

    const computedDeliveryFee =
      vendorCount > 0
        ? baseClearanceDeliveryFee +
          Math.max(0, vendorCount - 1) * extraVendorFee
        : 0;

    const subtotal = Number(orderData.subtotal_amount || 0);
    const tax = Number(orderData.tax_amount || 0);
    const discount = Number(orderData.discount_amount || 0);
    const computedTotalAmount = Math.max(
      0,
      subtotal + tax - discount + computedDeliveryFee,
    );

    orderData.delivery_fee = computedDeliveryFee;
    orderData.total_amount = computedTotalAmount;

    // Compute search text
    const customer = orderData.user_id
      ? await ctx.db.get(orderData.user_id)
      : null;
    const vendor = orderData.vendor_id
      ? await ctx.db.get(orderData.vendor_id)
      : null;

    const customerName = customer
      ? customer.name ||
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
      : "";

    orderData.searchText = computeOrderSearchText({
      ...orderData,
      customer: customer
        ? {
            name: customerName,
            email: customer.email,
            phone: customer.phone,
          }
        : null,
      vendor: vendor ? { name: vendor.name } : null,
    });

    // Create the order
    const orderId = await ctx.db.insert("orders", orderData);

    // Create clearance order items and decrement stock
    for (const item of args.clearance_items) {
      // Decrement stock via internal mutation
      await ctx.scheduler.runAfter(
        0,
        internal.clearanceProducts.decrementStock,
        {
          id: item.clearance_product_id,
          quantity: item.quantity,
        },
      );

      // Insert clearance order item
      await ctx.db.insert("clearance_order_items", {
        order_id: orderId,
        clearance_product_id: item.clearance_product_id,
        vendor_id: item.vendor_id,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        original_price: item.original_price,
        clearance_price: item.clearance_price,
        discount_percentage: item.discount_percentage,
        tax: 0,
        total: item.clearance_price * item.quantity,
        unit_type: item.unit_type,
        unit_value: item.unit_value,
        is_picked: false,
        picked_quantity: 0,
      });
    }

    return { success: true, orderId };
  },
});
