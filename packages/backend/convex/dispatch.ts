import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getDistance } from "geolib";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { getRoleIdByName, SYSTEM_ROLES } from "./lib/roles";

const NEAR_RADIUS_METERS = 100;
const MAX_FALLBACK_RADIUS_METRES = 2500;
const MAX_PENDING_ORDERS_PER_RIDER = 3;

export const autoAssignRiderToOrderInternal = internalMutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (order.rider_id)
      return {
        success: true,
        reason: "already_assigned",
      };

    // Skip clearance orders — they are handled by batch dispatch
    if (order.is_clearance) {
      return {
        success: false,
        reason: "clearance_order_uses_batch_dispatch",
      };
    }

    const vendor = await ctx.db.get(order.vendor_id);
    if (!vendor || !vendor.coordinates) {
      return {
        success: false,
        reason: "no_vendor_coords",
      };
    }

    const vendorLat = vendor.coordinates.lat;
    const vendorLng = vendor.coordinates.lng;

    const riderRoleId = await getRoleIdByName(ctx, SYSTEM_ROLES.RIDER);

    const activeRiders = riderRoleId
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id_rider_status", (q) =>
            q.eq("role_id", riderRoleId).eq("rider_details.status", "Active"),
          )
          .collect()
      : [];

    if (activeRiders.length === 0) {
      return {
        success: false,
        reason: "no_active_riders",
      };
    }

    const ridersWithCoords = activeRiders.filter(
      (r) => !!r.rider_details?.coordinates,
    );

    const distances = ridersWithCoords.map((r) => {
      const { lat, lng } = r.rider_details!.coordinates!;
      const metres = getDistance(
        { latitude: vendorLat, longitude: vendorLng },
        { latitude: lat, longitude: lng },
      );
      return { rider: r, metres };
    });

    // Count pending orders per rider using orders table
    const pendingOrdersByRider: Record<Id<"users">, number> = {};
    const pendingStatuses = ["Pickup", "Delivery"] as const;

    for (const rider of activeRiders) {
      const pendingOrders = await ctx.db
        .query("orders")
        .filter((q) =>
          q.and(
            q.eq(q.field("rider_id"), rider._id),
            q.or(
              q.eq(q.field("order_status"), "Pickup"),
              q.eq(q.field("order_status"), "Delivery"),
            ),
          ),
        )
        .collect();

      pendingOrdersByRider[rider._id] = pendingOrders.length;
    }

    // Filter out riders at or above capacity
    const eligibleWithCoords = distances.filter(
      (d) =>
        (pendingOrdersByRider[d.rider._id] ?? 0) < MAX_PENDING_ORDERS_PER_RIDER,
    );

    // Also consider active riders without coordinates (they can still be assigned)
    const ridersWithoutCoords = activeRiders.filter(
      (r) => !r.rider_details?.coordinates,
    );
    const eligibleWithoutCoords = ridersWithoutCoords.filter(
      (r) => (pendingOrdersByRider[r._id] ?? 0) < MAX_PENDING_ORDERS_PER_RIDER,
    );

    let chosen: { rider: (typeof activeRiders)[0]; metres: number } | undefined;

    // Priority 1: Near riders (within NEAR_RADIUS_METERS)
    const near = eligibleWithCoords
      .filter((d) => d.metres <= NEAR_RADIUS_METERS)
      .sort(
        (a, b) =>
          a.metres - b.metres ||
          pendingOrdersByRider[a.rider._id] - pendingOrdersByRider[b.rider._id],
      );
    chosen = near[0];

    // Priority 2: Within vendor service radius
    if (!chosen) {
      const fallBackRadius = Math.max(
        NEAR_RADIUS_METERS,
        Math.min(
          vendor.service_radius ?? MAX_FALLBACK_RADIUS_METRES,
          MAX_FALLBACK_RADIUS_METRES,
        ),
      );
      const withinVendorRadius = eligibleWithCoords
        .filter((d) => d.metres <= fallBackRadius)
        .sort(
          (a, b) =>
            a.metres - b.metres ||
            pendingOrdersByRider[a.rider._id] -
              pendingOrdersByRider[b.rider._id],
        );
      chosen = withinVendorRadius[0];
    }

    // Priority 3: Any eligible rider with coordinates (closest first)
    if (!chosen && eligibleWithCoords.length > 0) {
      const sortedByDistance = [...eligibleWithCoords].sort(
        (a, b) =>
          a.metres - b.metres ||
          pendingOrdersByRider[a.rider._id] - pendingOrdersByRider[b.rider._id],
      );
      chosen = sortedByDistance[0];
    }

    // Priority 4: Any eligible rider without coordinates (least pending orders)
    if (!chosen && eligibleWithoutCoords.length > 0) {
      const sortedByPending = [...eligibleWithoutCoords].sort(
        (a, b) => pendingOrdersByRider[a._id] - pendingOrdersByRider[b._id],
      );
      chosen = { rider: sortedByPending[0], metres: -1 };
    }

    if (!chosen) {
      return {
        success: false,
        reason: "no_eligible_riders",
      };
    }

    // Recheck for idempotency
    const fresh = await ctx.db.get(args.orderId);
    if (!fresh || fresh.rider_id) {
      return {
        success: true,
        reason: "already_assigned_concurrent",
      };
    }

    await ctx.db.patch(args.orderId, {
      rider_id: chosen.rider._id,
      order_status: "Delivery",
      updated_at: Date.now(),
    });

    // Create or update shipment to sync status
    const existingShipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .first();

    if (existingShipment) {
      await ctx.db.patch(existingShipment._id, {
        rider_id: chosen.rider._id,
        status: "Awaiting Pickup",
        updated_at: Date.now(),
      });
    } else {
      await ctx.db.insert("shipments", {
        order_id: args.orderId,
        vendor_id: order.vendor_id,
        rider_id: chosen.rider._id,
        pickup_address: vendor.address || {},
        delivery_address: order.address || {},
        status: "Awaiting Pickup",
        updated_at: Date.now(),
      });
    }

    // Send notification to the assigned rider
    try {
      await ctx.scheduler.runAfter(0, api.notifications.notifyRiderAssignment, {
        riderId: chosen.rider._id,
        orderId: args.orderId,
        shipmentId: existingShipment?._id,
      });
    } catch (error) {
      console.error("Failed to schedule rider assignment notification:", error);
    }

    return {
      success: true,
      riderId: chosen.rider._id,
      metres: chosen.metres,
      reason: "assigned",
    };
  },
});
