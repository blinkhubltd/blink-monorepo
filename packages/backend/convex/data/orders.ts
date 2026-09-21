import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { api } from "../_generated/api";
import {
  OrderItemUpdateValidator,
  OrdersValidator,
  orderPaymentStatus,
  orderStatus,
} from "../validators";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  assertPermission,
  getAuthUser,
  getUserByClerkId,
  type AuthedUser,
} from "../auth.helpers";
import { isSuperAdminPermissions } from "../lib/role_presets";
import { syncShipmentStatusForOrder } from "./shipments";
import { generateDeliveryCode as createDeliveryCode } from "../lib/delivery_code";
import { priceClearanceDelivery } from "../lib/delivery_fee";
import { readClearanceDeliveryPricing } from "./platform_settings";

/**
 * The vendors an admin caller's order access is limited to, or `null` for the
 * whole platform.
 *
 * A non-empty `manager_details.vendor_id` makes someone a vendor-scoped hub
 * manager; a super admin (holding `"*"`) is never scoped, whatever that field
 * says. This is the server-side half of the scope the orders page used to
 * enforce only by sending `vendor_ids` — a filter the browser chose, and so one
 * a manager could simply leave off.
 */
async function orderVendorScope(
  ctx: QueryCtx | MutationCtx,
  authed: AuthedUser,
): Promise<Id<"vendors">[] | null> {
  if (isSuperAdminPermissions(authed.permissions)) return null;
  // Re-read as a typed document: `AuthedUser.user` is an index-signature
  // shape, and a scope check is the wrong place to trust a cast.
  const me = await ctx.db.get(authed.user._id);
  const scopedVendorIds = me?.manager_details?.vendor_id ?? [];
  return scopedVendorIds.length > 0 ? scopedVendorIds : null;
}

/**
 * Load an order an admin caller may act on, or throw.
 *
 * Out of scope throws the same error as a missing id, so a scoped manager
 * cannot use a mutation to probe which order ids exist at other vendors.
 */
async function getScopedOrder(
  ctx: MutationCtx,
  scope: Id<"vendors">[] | null,
  orderId: Id<"orders">,
): Promise<Doc<"orders">> {
  const order = await ctx.db.get(orderId);
  if (!order || (scope !== null && !scope.includes(order.vendor_id))) {
    throw new ConvexError("Order not found");
  }
  return order;
}

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
      v.union(...orderStatus.map((e) => v.literal(e))),
    ),
    payment_status: v.optional(
      v.union(...orderPaymentStatus.map((e) => v.literal(e))),
    ),
    vendor_id: v.optional(v.id("vendors")),
    vendor_ids: v.optional(v.array(v.id("vendors"))),
    assigned_picker_id: v.optional(v.id("users")),
    is_clearance: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authed = await assertPermission(ctx, "orders:READ");
    const scope = await orderVendorScope(ctx, authed);

    const PageLimit = Math.max(1, Math.min(200, args.limit));
    const normalizedSearch = (args.search ?? "").trim();
    const isSearching = normalizedSearch.length > 0;

    // The vendors asked for. `vendor_id` wins over `vendor_ids`, as before.
    const requestedVendorIds: Id<"vendors">[] | undefined = args.vendor_id
      ? [args.vendor_id]
      : args.vendor_ids && args.vendor_ids.length > 0
        ? args.vendor_ids
        : undefined;

    // A scoped manager gets the intersection of what they asked for and what
    // they are assigned — never more. Asking for nothing means "all of mine".
    const allowedVendorIds =
      scope === null
        ? requestedVendorIds
        : (requestedVendorIds ?? scope).filter((id) => scope.includes(id));

    if (allowedVendorIds !== undefined && allowedVendorIds.length === 0) {
      return {
        data: [],
        pagination: {
          PageLimit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          cursor: null,
        },
      };
    }

    // A single vendor can use the vendor index (or narrow the search index).
    const effectiveVendorId =
      allowedVendorIds?.length === 1 ? allowedVendorIds[0] : undefined;

    // Applied whenever a vendor restriction exists, regardless of which index
    // was chosen. Several branches below (the picker indexes, payment status
    // alone) never applied `effectiveVendorId`, so without this a scoped
    // manager passing `assigned_picker_id` saw every vendor.
    const scopeFilter = (q: any) =>
      q.or(...allowedVendorIds!.map((id) => q.eq(q.field("vendor_id"), id)));

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

    // Vendor restriction — the requested vendors, or a scoped manager's own.
    // Covers the multi-vendor case and any index branch that ignored the vendor.
    if (allowedVendorIds) {
      ordersQuery = ordersQuery.filter(scopeFilter);
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
      // Same restriction as the page. Previously only the multi-vendor case was
      // applied here, so `order_status` + one vendor counted every vendor.
      if (allowedVendorIds) {
        countQuery = countQuery.filter(scopeFilter);
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
      v.union(...orderStatus.map((e) => v.literal(e))),
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
    const authed = await assertPermission(ctx, "orders:DELETE");
    const scope = await orderVendorScope(ctx, authed);
    await getScopedOrder(ctx, scope, args.id);

    await ctx.db.delete(args.id);
    return {
      success: true,
    };
  },
});

/**
 * Move an order to `status`, with every side effect a status change carries:
 * timestamps, the Delivery/Delivered notification, the shipment sync, and the
 * stock fulfil/release.
 *
 * A plain function rather than a mutation so each entry point can authorise in
 * its own terms and then share one implementation:
 *
 *   - `updateOrderStatus` — admin, `orders:UPDATE` within the vendor scope.
 *   - `verifyDeliveryCode` — the order's assigned rider, who holds no
 *     permissions at all. It used to `runMutation(api...updateOrderStatus)`,
 *     which would now reject the rider mid-handover.
 *   - `setOrderStatus` — internal, for the scheduled payment confirmation,
 *     which runs with no identity.
 */
async function applyOrderStatus(
  ctx: MutationCtx,
  order: Doc<"orders">,
  status: Doc<"orders">["order_status"],
): Promise<void> {
  const orderId = order._id;

    // Update order status
    await ctx.db.patch(orderId, {
      order_status: status,
      updated_at: Date.now(),
      // Capture timestamps for pickup duration tracking
      ...(status === "Confirmed" && !order.confirmed_at
        ? { confirmed_at: Date.now() }
        : {}),
      ...(status === "Pickup" ? { picked_up_at: Date.now() } : {}),
    });

    // For Delivery / Delivered trigger notification pipeline if called directly via admin panel
    if (status === "Delivery" || status === "Delivered") {
      try {
        console.log(
          "[updateOrderStatus] scheduling triggerOrderStatusNotification",
          {
            orderId: orderId,
            status: status,
            previousStatus: order.order_status,
            invokedFrom: "orders.updateOrderStatus",
          },
        );
        await ctx.scheduler.runAfter(
          0,
          api.data.notifications.triggerOrderStatusNotification,
          {
            orderId: orderId,
            newStatus: status,
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
      await syncShipmentStatusForOrder(ctx, orderId, status);
    } catch (syncError) {
      console.error(
        `Shipment status sync failed for order ${orderId}:`,
        syncError,
      );
    }

    // Handle stock fulfillment when order is delivered or in transit
    if (
      (status === "Delivered" || status === "Delivery") &&
      order.payment_reference
    ) {
      try {
        // Call the stock fulfillment function
        await ctx.runMutation(internal.data.stock_reservation.fulfillStock, {
          orderReference: order.payment_reference,
        });
        console.log(
          `Stock reservation marked as fulfilled for order ${orderId} - inventory managed by external API`,
        );
      } catch (stockError) {
        console.error(
          `Stock fulfillment failed for order ${orderId}:`,
          stockError,
        );
      }
    }

    // Handle stock release when order is cancelled or refunded
    if (
      (status === "Cancelled" || status === "Refunded") &&
      order.payment_reference
    ) {
      try {
        // Call the stock release function
        await ctx.runMutation(internal.data.stock_reservation.releaseStock, {
          orderReference: order.payment_reference,
        });
        console.log(
          `Stock released for cancelled/refunded order ${orderId} with reference ${order.payment_reference}`,
        );
      } catch (stockError) {
        console.error(
          `Stock release failed for order ${orderId}:`,
          stockError,
        );
        // Don't throw error - order status update should still succeed
      }
    }

}

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(...orderStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    const authed = await assertPermission(ctx, "orders:UPDATE");
    const scope = await orderVendorScope(ctx, authed);
    const order = await getScopedOrder(ctx, scope, args.orderId);

    await applyOrderStatus(ctx, order, args.status);

    return await ctx.db.get(args.orderId);
  },
});

/**
 * `updateOrderStatus` for server-side callers with no user identity — the
 * payment-confirmation path schedules `updateOrderStatusWithNotifications`,
 * and a scheduled function carries no auth.
 *
 * Returns the previous status so that action need not read the order through
 * the public `getOrderById`. A no-op when the status is unchanged.
 */
export const setOrderStatus = internalMutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(...orderStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    const previousStatus = order.order_status;
    if (previousStatus !== args.status) {
      await applyOrderStatus(ctx, order, args.status);
    }
    return { previousStatus, changed: previousStatus !== args.status };
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
        api.data.notifications.triggerOrderStatusNotification,
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
    status: v.union(...orderPaymentStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    const authed = await assertPermission(ctx, "orders:UPDATE");
    const scope = await orderVendorScope(ctx, authed);
    await getScopedOrder(ctx, scope, args.orderId);

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

/**
 * Mint (or re-read) the code that authorises a handover.
 *
 * `internalMutation`, and that is a security fix rather than tidying. As a
 * public mutation this **disclosed the delivery code to any anonymous caller**:
 * the early return below hands back `order.delivery_code` whenever a code
 * already exists and is unverified, so `generateDeliveryCode({ orderId })` was
 * enough to obtain the secret that releases someone else's goods. No guessing
 * required.
 *
 * `lib/delivery_code.ts` reasons that "guessing is bounded by the order lookup
 * rather than by entropy" — which was true, and was the problem: the order
 * lookup was not authenticated either.
 *
 * Calling it also re-sent the code by push/SMS, so it doubled as a way to spam
 * a customer. Both callers are server-side (`notifications.ts`, `payments.ts`),
 * so nothing legitimate is lost.
 */
export const generateDeliveryCode = internalMutation({
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
      await ctx.scheduler.runAfter(0, api.data.notifications.sendDeliveryCode, {
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

/**
 * Confirm a handover against the code the customer reads out.
 *
 * ── Why the caller is now checked ────────────────────────────────────────
 *
 * This was public, unauthenticated, and took `riderId` as an OPTIONAL ARGUMENT
 * that it never used for anything. So an anonymous caller could mark somebody
 * else's order Delivered by supplying an order id and the right six digits —
 * and because a wrong code returned `{ verified: false }` instead of throwing,
 * it was also its own brute-force oracle.
 *
 * `riderId` is now derived from the auth token and the argument is **removed**
 * rather than accepted-and-ignored: an ignored parameter invites a future change
 * to start honouring it, which is precisely how it got here.
 *
 * A wrong code still returns `{ verified: false }` rather than throwing — a
 * rider mistyping at a doorstep is an ordinary event, and the rider app
 * distinguishes it from a failure. The brute-force concern is answered by the
 * caller having to BE the assigned rider, not by making a typo fatal.
 */
export const verifyDeliveryCode = mutation({
  args: {
    orderId: v.id("orders"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Only the rider actually carrying this order may close it. Checked against
    // the order's own `rider_id`, so a signed-in rider cannot confirm a
    // delivery assigned to a colleague.
    if (!order.rider_id || order.rider_id !== user._id) {
      throw new ConvexError(
        "Only the rider assigned to this delivery can verify its code",
      );
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
    // Directly, not through the public `updateOrderStatus`: that is gated on
    // `orders:UPDATE`, which a rider does not hold. The rider check above is
    // this path's authorisation.
    if (order.order_status !== "Delivered") {
      await applyOrderStatus(ctx, order, "Delivered");
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
      await ctx.scheduler.runAfter(0, api.data.notifications.sendDeliveryCode, {
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

/**
 * Test a code without consuming it.
 *
 * `internalQuery`: as a public query with no auth this was a free, unlimited,
 * side-effect-free oracle for brute-forcing a six-digit code — it answered
 * "is this the right code for this order" to anybody who asked, without even
 * the audit trail a mutation would leave. 900,000 candidates is nothing against
 * an endpoint that cheap.
 *
 * It has no callers in any app, so it is closed rather than gated. If a rider
 * screen ever wants live validation, it should go through the same
 * assigned-rider check `verifyDeliveryCode` now performs.
 */
export const checkDeliveryCode = internalQuery({
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
    status: v.union(...orderStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    const authed = await assertPermission(ctx, "orders:UPDATE");
    const scope = await orderVendorScope(ctx, authed);
    const { orderIds, status } = args;

    // All or nothing: resolve every order (and its scope) before writing any,
    // so one out-of-scope id rejects the batch rather than half-applying it.
    const orders = await Promise.all(
      orderIds.map((orderId) => getScopedOrder(ctx, scope, orderId)),
    );

    // Update all orders with timestamps
    const updatePromises = orders.map(async (order) => {
      await ctx.db.patch(order._id, {
        order_status: status,
        updated_at: Date.now(),
        ...(status === "Confirmed" && !order.confirmed_at
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
      v.union(...orderStatus.map((e) => v.literal(e))),
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
    const authed = await assertPermission(ctx, "orders:UPDATE");
    const scope = await orderVendorScope(ctx, authed);
    await getScopedOrder(ctx, scope, args.orderId);

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
      await ctx.scheduler.runAfter(0, api.data.notifications.notifyRiderAssignment, {
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

/**
 * @internal Zero callers, no auth, and it accepted a whole client-built order
 * including its prices. Worse than the regular creator in one respect: it wrote
 * ONE order for a basket whose items could span several vendors, computing the
 * fee from the distinct vendor count while attributing the whole order to a
 * single `vendor_id` — so a two-shop clearance basket became one order that one
 * shop was expected to fulfil in full. Use `clearance_checkout`.
 */
export const createClearanceOrder = internalMutation({
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

    // Reads through the shared reader rather than two inline `by_key` lookups
    // with their own local defaults. The duplication this replaces is exactly
    // the drift the key-constant pattern exists to stop: this file had its own
    // `parseNonNegative` with 150/50 baked in, so a settings change reached the
    // quote and not the charge.
    const clearancePricing = await readClearanceDeliveryPricing(ctx);
    const vendorCount = new Set(args.clearance_items.map((i) => i.vendor_id))
      .size;

    // Clearance is deliberately excluded from the free-delivery threshold —
    // those items are already discounted, and waiving delivery on top erodes
    // the margin twice. `priceClearanceDelivery` takes no subtotal, so the
    // threshold cannot leak in by accident.
    const computedDeliveryFee = priceClearanceDelivery(
      vendorCount,
      clearancePricing,
    );

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
        internal.data.clearance_products.decrementStock,
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

/**
 * One of the caller's own orders, with its items.
 *
 * Auth-derived and ownership-checked. `getOrderById` and `getOrderWithItems`
 * take only an order id with no auth at all, and the latter joins the customer
 * row — so an order id was enough to read somebody's name, and the order carries
 * their address and phone. Order ids are sequential-ish Convex ids, not secrets.
 *
 * Returns null rather than throwing for an order that is not the caller's, so
 * the screen shows "not found" and does not confirm that the id exists.
 */
export const getMyOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return null;

    const order = await ctx.db.get(args.orderId);
    if (!order || order.user_id !== user._id) return null;

    const [vendor, items] = await Promise.all([
      ctx.db.get(order.vendor_id),
      ctx.db
        .query("order_items")
        .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
        .collect(),
    ]);

    // Deliberately no customer join: the caller IS the customer, so returning
    // their own name adds nothing and widens what a leak would expose.
    return {
      ...order,
      vendor: vendor ? { _id: vendor._id, name: vendor.name } : null,
      items,
    };
  },
});

/**
 * Every order in one basket, by the reference they share.
 *
 * A basket spanning several shops becomes several orders. The confirmation
 * screen shows all of them, because a customer who bought one basket should not
 * have to work out that it became three deliveries.
 */
export const getMyOrdersByReference = query({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return [];

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_payment_reference", (q) =>
        q.eq("payment_reference", args.reference),
      )
      .collect();

    return orders.filter((o) => o.user_id === user._id);
  },
});

/**
 * The caller's own order history, newest first.
 *
 * Auth-derived. `getUserOrders` and `getUserOrdersPaginated` above take the user
 * id as an ARGUMENT, so an order id or a user id was enough to read somebody's
 * history — which carries their address, their phone and everything they have
 * ever bought.
 *
 * Bounded rather than paginated: a customer's history is small enough that a
 * cursor is more machinery than the screen needs, and `take` keeps the read off
 * the per-query document ceiling regardless of how long they have been a
 * customer.
 */
export const getMyOrders = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return [];

    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .order("desc")
      .take(limit);

    return Promise.all(
      orders.map(async (order) => {
        const vendor = await ctx.db.get(order.vendor_id);
        const items = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("order_id", order._id))
          .collect();

        return {
          _id: order._id,
          reference: order.reference,
          // The basket reference, so the list can group several deliveries that
          // came from one checkout.
          paymentReference: order.payment_reference ?? null,
          orderDate: order.order_date,
          orderStatus: order.order_status,
          paymentStatus: order.payment_status,
          paymentMode: order.payment_mode ?? null,
          total: order.total_amount,
          deliveryFee: order.delivery_fee,
          vendorName: vendor?.name ?? null,
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
          // A couple of names, so a row is recognisable without opening it.
          previewNames: items.slice(0, 2).map((i) => i.name),
        };
      }),
    );
  },
});
