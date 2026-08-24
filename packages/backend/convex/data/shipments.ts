import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  ORDER_TO_SHIPMENT_STATUS,
  shipmentStatusToOrderStatus,
  type OrderStatus,
} from "../lib/status_mapping";
import {
  shipmentStatus,
} from "../validators";

const computeShipmentSearchText = (shipment: {
  status?: string;
  order?: { reference?: string } | null;
  customer?: { name?: string; email?: string; phone?: string } | null;
  vendor?: { name?: string } | null;
  rider?: { name?: string; email?: string; phone?: string } | null;
}) => {
  return [
    shipment.order?.reference ?? "",
    shipment.customer?.name ?? "",
    shipment.customer?.email ?? "",
    shipment.customer?.phone ?? "",
    shipment.vendor?.name ?? "",
    shipment.rider?.name ?? "",
    shipment.rider?.email ?? "",
    shipment.rider?.phone ?? "",
    shipment.status ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};


export const getAllShipments = query({
  args: {},
  handler: async (ctx, args) => {
    return await ctx.db.query("shipments").collect();
  },
});

export const getShipments = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(
      v.union(...shipmentStatus.map((e) => v.literal(e))),
    ),
    vendor_id: v.optional(v.id("vendors")),
    rider_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const PageLimit = Math.max(1, Math.min(200, args.limit));
    const normalizedSearch = (args.search ?? "").trim();
    const isSearching = normalizedSearch.length > 0;

    const baseQuery = ctx.db.query("shipments");

    let shipmentsQuery;
    if (isSearching) {
      shipmentsQuery = baseQuery.withSearchIndex("search_text", (q) => {
        let sq = q.search("searchText", normalizedSearch);
        if (args.status) {
          sq = sq.eq("status", args.status);
        }
        if (args.vendor_id) {
          sq = sq.eq("vendor_id", args.vendor_id);
        }
        if (args.rider_id) {
          sq = sq.eq("rider_id", args.rider_id);
        }
        return sq;
      });
    } else if (args.status && args.vendor_id) {
      shipmentsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("vendor_id"), args.vendor_id!))
        .order("desc");
    } else if (args.status && args.rider_id) {
      shipmentsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("rider_id"), args.rider_id!))
        .order("desc");
    } else if (args.status) {
      shipmentsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc");
    } else if (args.vendor_id) {
      shipmentsQuery = baseQuery
        .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendor_id!))
        .order("desc");
    } else if (args.rider_id) {
      shipmentsQuery = baseQuery
        .withIndex("by_rider", (q) => q.eq("rider_id", args.rider_id!))
        .order("desc");
    } else {
      shipmentsQuery = baseQuery.order("desc");
    }

    const pageResult = await shipmentsQuery.paginate({
      cursor: args.cursor ?? null,
      numItems: PageLimit,
    });

    const currentPageShipments = pageResult.page;

    const enrichedShipments = await Promise.all(
      currentPageShipments.map(async (shipment) => {
        const rider = await ctx.db.get(shipment.rider_id);

        const order = await ctx.db.get(shipment.order_id);

        const customer = order ? await ctx.db.get(order.user_id) : null;

        const vendor = await ctx.db.get(shipment.vendor_id);

        const riderName = rider ? rider.first_name + " " + rider.last_name : "";
        const customerName = customer
          ? customer.first_name + " " + customer.last_name
          : "";

        return {
          ...shipment,
          rider: rider
            ? {
                _id: rider._id,
                name: riderName,
                email: rider.email,
                phone: rider.phone,
                image: rider.image,
                vehicle_type: rider.rider_details?.vehicle_type,
                vehicle_plate: rider.rider_details?.vehicle_plate,
              }
            : null,
          order: order
            ? {
                _id: order._id,
                reference: order.reference,
                order_date: order.order_date,
                total_amount: order.total_amount,
              }
            : null,
          customer: customer
            ? {
                _id: customer._id,
                name: customerName,
                email: customer.email,
                phone: customer.phone,
              }
            : null,
          vendor: vendor
            ? {
                _id: vendor._id,
                name: vendor.name,
              }
            : null,
        };
      }),
    );

    const total = (
      isSearching
        ? await baseQuery
            .withSearchIndex("search_text", (q) => {
              let sq = q.search("searchText", normalizedSearch);
              if (args.status) {
                sq = sq.eq("status", args.status);
              }
              if (args.vendor_id) {
                sq = sq.eq("vendor_id", args.vendor_id);
              }
              if (args.rider_id) {
                sq = sq.eq("rider_id", args.rider_id);
              }
              return sq;
            })
            .collect()
        : args.status
          ? await baseQuery
              .withIndex("by_status", (q) => q.eq("status", args.status!))
              .collect()
          : args.vendor_id
            ? await baseQuery
                .withIndex("by_vendor", (q) =>
                  q.eq("vendor_id", args.vendor_id!),
                )
                .collect()
            : args.rider_id
              ? await baseQuery
                  .withIndex("by_rider", (q) =>
                    q.eq("rider_id", args.rider_id!),
                  )
                  .collect()
              : await baseQuery.collect()
    ).length;

    const totalPages = Math.max(1, Math.ceil(total / PageLimit));

    return {
      data: enrichedShipments,
      pagination: {
        PageLimit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const backfillShipmentsSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const shipments = await ctx.db.query("shipments").collect();
    let updatedCount = 0;

    for (const shipment of shipments) {
      const [rider, order, vendor] = await Promise.all([
        ctx.db.get(shipment.rider_id),
        ctx.db.get(shipment.order_id),
        ctx.db.get(shipment.vendor_id),
      ]);
      const customer = order ? await ctx.db.get(order.user_id) : null;

      const riderName = rider
        ? `${rider.first_name || ""} ${rider.last_name || ""}`.trim()
        : "";
      const customerName = customer
        ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
        : "";

      const searchText = computeShipmentSearchText({
        status: shipment.status,
        order: order ? { reference: order.reference } : null,
        vendor: vendor ? { name: vendor.name } : null,
        rider: rider
          ? {
              name: riderName,
              email: rider.email,
              phone: rider.phone,
            }
          : null,
        customer: customer
          ? {
              name: customerName,
              email: customer.email,
              phone: customer.phone,
            }
          : null,
      });

      if (shipment.searchText === searchText) continue;
      await ctx.db.patch(shipment._id, { searchText, updated_at: Date.now() });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const updateStatus = mutation({
  args: {
    shipmentId: v.id("shipments"),
    status: v.union(...shipmentStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    const currentShipment = await ctx.db.get(args.shipmentId);
    if (!currentShipment) {
      throw new Error("Shipment not found");
    }
    await ctx.db.patch(args.shipmentId, {
      status: args.status,
      updated_at: Date.now(),
    });

    const order = await ctx.db.get(currentShipment.order_id);
    if (order) {
      const mappedOrderStatus = shipmentStatusToOrderStatus(args.status);
      await ctx.db.patch(order._id, {
        order_status: mappedOrderStatus,
        updated_at: Date.now(),
      });
    }

    return {
      success: true,
      shipmentStatus: args.status,
      orderStatus: order
        ? shipmentStatusToOrderStatus(args.status)
        : undefined,
    };
  },
});

export const getShipmentByOrderId = query({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .first();

    if (!shipment) {
      return null;
    }

    const [rider, order, vendor] = await Promise.all([
      ctx.db.get(shipment.rider_id),
      ctx.db.get(shipment.order_id),
      ctx.db.get(shipment.vendor_id),
    ]);

    const customer = order ? await ctx.db.get(order.user_id) : null;

    return {
      ...shipment,
      rider,
      order,
      vendor,
      customer,
    };
  },
});

export const getShipmentDetails = query({
  args: {
    shipmentId: v.id("shipments"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) {
      return null;
    }

    const [rider, order, vendor] = await Promise.all([
      ctx.db.get(shipment.rider_id),
      ctx.db.get(shipment.order_id),
      ctx.db.get(shipment.vendor_id),
    ]);

    const customer = order ? await ctx.db.get(order.user_id) : null;

    return {
      ...shipment,
      rider,
      order,
      vendor,
      customer,
    };
  },
});

export const reassignRider = mutation({
  args: {
    shipmentId: v.id("shipments"),
    riderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) {
      throw new Error("Shipment not found");
    }

    const rider = await ctx.db.get(args.riderId);
    const riderRole = rider?.role_id ? await ctx.db.get(rider.role_id) : null;
    if (!rider || riderRole?.name !== "Rider") {
      throw new ConvexError("Invalid rider selected");
    }

    const order = await ctx.db.get(shipment.order_id);
    if (!order) {
      throw new Error("Related order not found");
    }

    await ctx.db.patch(args.shipmentId, {
      rider_id: args.riderId,
      status: "Awaiting Pickup",
      updated_at: Date.now(),
    });

    await ctx.db.patch(order._id, {
      rider_id: args.riderId,
      order_status: "Processing",
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

export const getAvailableRiders = query({
  args: {},
  handler: async (ctx) => {
    const riderRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Rider"))
      .unique();
    const riders = riderRole
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id_rider_status", (q) =>
            q.eq("role_id", riderRole._id).eq("rider_details.status", "Active"),
          )
          .collect()
      : [];

    return riders.map((rider) => ({
      _id: rider._id,
      name: `${rider.first_name} ${rider.last_name}`,
      email: rider.email,
      phone: rider.phone,
      status: rider.rider_details?.status,
      coordinates: rider.rider_details?.coordinates,
    }));
  },
});

export const getAllRiderDeliveries = query({
  args: {
    riderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const deliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    return deliveries;
  },
});

export const getPendingRiderDeliveries = query({
  args: {
    riderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get all deliveries for the rider and filter for pending statuses
    const allDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    // Filter for pending statuses (not delivered or failed)
    return allDeliveries.filter(
      (delivery) =>
        delivery.status === "Awaiting Pickup" ||
        delivery.status === "Picked Up" ||
        delivery.status === "Out for Delivery",
    );
  },
});

// Enriched list for rider with order and customer details
export const listRiderDeliveries = query({
  args: {
    riderId: v.id("users"),
    onlyPending: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const deliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    const filtered = args.onlyPending
      ? deliveries.filter(
          (d) =>
            d.status === "Awaiting Pickup" ||
            d.status === "Picked Up" ||
            d.status === "Out for Delivery",
        )
      : deliveries;

    const enriched = await Promise.all(
      filtered.map(async (shipment) => {
        const order = await ctx.db.get(shipment.order_id);
        const customer = order ? await ctx.db.get(order.user_id) : null;

        const customerName = customer
          ? `${customer.first_name} ${customer.last_name}`.trim()
          : undefined;

        return {
          ...shipment,
          order_ref: order?.reference,
          payment_method: order?.payment_method,
          customer_name: customerName,
          is_clearance: order?.is_clearance,
        };
      }),
    );

    return enriched;
  },
});

export const getUserShipments = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First find the user by clerkId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const userOrders = await ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .collect();

    // Get all shipments for these orders with enriched data
    const enrichedShipments = [];
    for (const order of userOrders) {
      const orderShipments = await ctx.db
        .query("shipments")
        .withIndex("by_order", (q) => q.eq("order_id", order._id))
        .collect();

      for (const shipment of orderShipments) {
        // Get rider, vendor, and order items details
        const [rider, vendor, orderItems] = await Promise.all([
          ctx.db.get(shipment.rider_id),
          ctx.db.get(shipment.vendor_id),
          ctx.db
            .query("order_items")
            .withIndex("by_order", (q) => q.eq("order_id", order._id))
            .collect(),
        ]);

        enrichedShipments.push({
          shipment,
          order: {
            ...order,
            order_items: orderItems,
          },
          rider,
          vendor,
        });
      }
    }

    // Sort by most recent first
    return enrichedShipments.sort(
      (a, b) => b.shipment.updated_at - a.shipment.updated_at,
    );
  },
});

/**
 * Push an order status change down onto its shipment(s).
 *
 * Moved from `helpers/statusSync.ts`. Two changes beyond the move:
 *
 *   - `ctx: any` is now `MutationCtx`, so the query builder and patch are type
 *     checked.
 *   - The order->shipment map is imported from `lib/status_mapping` instead of
 *     being declared inline. That file previously held a second copy of the
 *     mapping tables, exported as `StatusMappings` "for documentation / tests"
 *     that did not exist and which nothing imported.
 *
 * Idempotent: only shipments whose status actually differs are patched, and the
 * count of patches is returned so callers can tell a no-op from a change.
 */
export async function syncShipmentStatusForOrder(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  newOrderStatus: string,
) {
  const order = await ctx.db.get(orderId);
  if (!order) return { updated: false, reason: "ORDER_NOT_FOUND" as const };

  const shipments = await ctx.db
    .query("shipments")
    .withIndex("by_order", (q) => q.eq("order_id", orderId))
    .collect();

  if (shipments.length === 0) {
    return { updated: false, reason: "NO_SHIPMENTS" as const };
  }

  const target = ORDER_TO_SHIPMENT_STATUS[newOrderStatus as OrderStatus];
  if (!target) {
    // No analog for this order status — payment-only transitions land here.
    return { updated: false, reason: "NO_MAPPING" as const };
  }

  let patches = 0;
  for (const shipment of shipments) {
    if (shipment.status !== target) {
      await ctx.db.patch(shipment._id, {
        status: target,
        updated_at: Date.now(),
      });
      patches++;
    }
  }

  return {
    updated: patches > 0,
    patches,
    shipmentCount: shipments.length,
    targetShipmentStatus: target,
  };
}
