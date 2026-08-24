import { mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { getDistance } from "geolib";
import { getRoleIdByName, SYSTEM_ROLES } from "../lib/roles";

const MAX_PENDING_ORDERS_PER_RIDER = 3;

/**
 * Add a clearance order to a batch.
 * - If a "Pending" batch exists for this vendor, add the order to it.
 *   If that pushes the batch to max capacity, dispatch immediately.
 * - If no pending batch exists, create one and schedule a timeout.
 */
export const addOrderToBatch = mutation({
  args: {
    orderId: v.id("orders"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    // Get batch settings
    const [waitSetting, maxSetting] = await Promise.all([
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "clearance_batch_wait_minutes"))
        .first(),
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "clearance_batch_max_orders"))
        .first(),
    ]);

    const waitMinutes = waitSetting ? parseInt(waitSetting.value, 10) : 20;
    const maxOrders = maxSetting ? parseInt(maxSetting.value, 10) : 5;

    // Look for existing pending batch for this vendor
    const existingBatch = await ctx.db
      .query("clearance_batches")
      .withIndex("by_vendor_status", (q) =>
        q.eq("vendor_id", args.vendorId).eq("status", "Pending"),
      )
      .first();

    if (existingBatch) {
      const updatedOrderIds = [...existingBatch.order_ids, args.orderId];
      await ctx.db.patch(existingBatch._id, { order_ids: updatedOrderIds });

      // If batch reaches max capacity, dispatch immediately
      if (updatedOrderIds.length >= maxOrders) {
        await ctx.scheduler.runAfter(
          0,
          internal.data.clearance_batching.dispatchBatch,
          { batchId: existingBatch._id },
        );
      }

      return { batchId: existingBatch._id, action: "added_to_existing" };
    }

    // Create new batch and schedule timeout
    const batchId = await ctx.db.insert("clearance_batches", {
      vendor_id: args.vendorId,
      order_ids: [args.orderId],
      status: "Pending",
      created_at: Date.now(),
    });

    // Schedule timeout to dispatch even if batch isn't full
    await ctx.scheduler.runAfter(
      waitMinutes * 60 * 1000,
      internal.data.clearance_batching.processBatchTimeout,
      { batchId },
    );

    return { batchId, action: "created_new" };
  },
});

/**
 * Create a batch immediately and dispatch it (used for multi-vendor orders).
 */
export const createAndDispatchBatch = mutation({
  args: {
    orderIds: v.array(v.id("orders")),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const batchId = await ctx.db.insert("clearance_batches", {
      vendor_id: args.vendorId,
      order_ids: args.orderIds,
      status: "Pending",
      created_at: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.data.clearance_batching.dispatchBatch, {
      batchId,
    });

    return { batchId };
  },
});

/**
 * Fired after the batch wait period expires.
 * If batch is still "Pending", dispatch it regardless of size.
 */
export const processBatchTimeout = internalMutation({
  args: { batchId: v.id("clearance_batches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) return;

    // Only dispatch if still pending (wasn't already dispatched due to max capacity)
    if (batch.status !== "Pending") return;

    await ctx.runMutation(internal.data.clearance_batching.dispatchBatch, {
      batchId: args.batchId,
    });
  },
});

/**
 * Assign a clearance rider to the batch using distance-based dispatch.
 * Falls back to any active rider if no clearance riders are available.
 */
export const dispatchBatch = internalMutation({
  args: { batchId: v.id("clearance_batches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.status !== "Pending") return;

    // Get first order's vendor for distance calculation
    const firstOrder =
      batch.order_ids.length > 0 ? await ctx.db.get(batch.order_ids[0]) : null;
    const vendor = firstOrder
      ? await ctx.db.get(firstOrder.vendor_id)
      : await ctx.db.get(batch.vendor_id);

    if (!vendor || !vendor.coordinates) {
      // Cannot dispatch without vendor coordinates; leave pending
      return;
    }

    const vendorLat = vendor.coordinates.lat;
    const vendorLng = vendor.coordinates.lng;

    const riderRoleId = await getRoleIdByName(ctx, SYSTEM_ROLES.RIDER);
    if (!riderRoleId) return;

    const activeRiders = await ctx.db
      .query("users")
      .withIndex("by_role_id_rider_status", (q) =>
        q.eq("role_id", riderRoleId).eq("rider_details.status", "Active"),
      )
      .collect();

    if (activeRiders.length === 0) return;

    // Prefer clearance riders first
    const clearanceRiders = activeRiders.filter(
      (r) => r.rider_details?.is_clearance_rider === true,
    );

    // Use clearance riders if available, otherwise fall back to all active riders
    const candidatePool =
      clearanceRiders.length > 0 ? clearanceRiders : activeRiders;

    // Count pending orders per rider
    const pendingOrdersByRider: Record<Id<"users">, number> = {};
    for (const rider of candidatePool) {
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

    // Split into riders with/without coordinates
    const ridersWithCoords = candidatePool.filter(
      (r) => !!r.rider_details?.coordinates,
    );
    const ridersWithoutCoords = candidatePool.filter(
      (r) => !r.rider_details?.coordinates,
    );

    const distances = ridersWithCoords.map((r) => {
      const { lat, lng } = r.rider_details!.coordinates!;
      const metres = getDistance(
        { latitude: vendorLat, longitude: vendorLng },
        { latitude: lat, longitude: lng },
      );
      return { rider: r, metres };
    });

    // Filter by capacity
    const eligibleWithCoords = distances.filter(
      (d) =>
        (pendingOrdersByRider[d.rider._id] ?? 0) < MAX_PENDING_ORDERS_PER_RIDER,
    );
    const eligibleWithoutCoords = ridersWithoutCoords.filter(
      (r) => (pendingOrdersByRider[r._id] ?? 0) < MAX_PENDING_ORDERS_PER_RIDER,
    );

    let chosen: (typeof candidatePool)[0] | undefined;

    // Distance-based selection (closest first)
    if (eligibleWithCoords.length > 0) {
      const sorted = [...eligibleWithCoords].sort(
        (a, b) =>
          a.metres - b.metres ||
          (pendingOrdersByRider[a.rider._id] ?? 0) -
            (pendingOrdersByRider[b.rider._id] ?? 0),
      );
      chosen = sorted[0].rider;
    }

    // Fallback to riders without coordinates (least pending)
    if (!chosen && eligibleWithoutCoords.length > 0) {
      const sorted = [...eligibleWithoutCoords].sort(
        (a, b) =>
          (pendingOrdersByRider[a._id] ?? 0) -
          (pendingOrdersByRider[b._id] ?? 0),
      );
      chosen = sorted[0];
    }

    if (!chosen) return; // No eligible rider found

    // Assign rider to batch
    await ctx.db.patch(args.batchId, {
      rider_id: chosen._id,
      status: "Assigned",
      assigned_at: Date.now(),
    });

    // Patch each order in the batch with rider_id and batch_id
    for (const orderId of batch.order_ids) {
      const order = await ctx.db.get(orderId);
      if (order && !order.rider_id) {
        await ctx.db.patch(orderId, {
          rider_id: chosen._id,
          batch_id: args.batchId,
          order_status: "Delivery",
          updated_at: Date.now(),
        });
      }
    }
  },
});
