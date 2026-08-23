/**
 * Status synchronization helper between Orders and Shipments.
 * This ensures that when an Order status changes, the related Shipment status
 * is updated to a corresponding state (if a shipment exists), while keeping
 * the domain-specific terminology distinct.
 */
import { Id } from "../_generated/dataModel";

// Order -> Shipment mapping (forward sync)\n// We intentionally do not map certain terminal or payment-related states
// that have no shipment analog.
const ORDER_TO_SHIPMENT_STATUS: Record<string, string | null> = {
  Pending: "Awaiting Pickup", // Order created, shipment waiting pickup
  Confirmed: "Awaiting Pickup", // Still not picked by rider
  Processing: "Awaiting Pickup", // Seller preparing; shipment not yet picked
  Pickup: "Picked Up", // Rider has collected goods
  Delivery: "Out for Delivery", // Rider en route
  Delivered: "Delivered", // Final delivered state
  Cancelled: "Failed Delivery", // Treat cancellation as failed/cancelled shipment
  Refunded: "Failed Delivery", // Refunded after failure
};

// Shipment -> Order mapping (reverse) already exists in shipments.ts; replicate for central reference
const SHIPMENT_TO_ORDER_STATUS: Record<string, string> = {
  "Awaiting Pickup": "Pending",
  "Picked Up": "Confirmed", // Could arguably be Processing; business chose Confirmed earlier
  "Out for Delivery": "Processing", // Order in transit
  Delivered: "Delivered",
  "Failed Delivery": "Cancelled",
};

/**
 * Sync the shipment status given an updated order status.
 * Idempotent: will only patch when a status transition is actually required.
 */
export const syncShipmentStatusForOrder = async (
  ctx: any,
  orderId: Id<"orders">,
  newOrderStatus: string
) => {
  const order = await ctx.db.get(orderId);
  if (!order) return { updated: false, reason: "ORDER_NOT_FOUND" };

  // Find linked shipment(s) for this order.
  const shipments = await ctx.db
    .query("shipments")
    .withIndex("by_order", (q: any) => q.eq("order_id", orderId))
    .collect();

  if (!shipments.length) {
    return { updated: false, reason: "NO_SHIPMENTS" };
  }

  const targetShipmentStatus = ORDER_TO_SHIPMENT_STATUS[newOrderStatus];
  if (!targetShipmentStatus) {
    // No mapping means we intentionally skip (e.g., payment-only transitions)
    return { updated: false, reason: "NO_MAPPING" };
  }

  let patches = 0;
  for (const shipment of shipments) {
    if (shipment.status !== targetShipmentStatus) {
      await ctx.db.patch(shipment._id, {
        status: targetShipmentStatus,
        updated_at: Date.now(),
      });
      patches++;
    }
  }

  return {
    updated: patches > 0,
    patches,
    shipmentCount: shipments.length,
    targetShipmentStatus,
  };
};

/**
 * Expose mappings for documentation / tests
 */
export const StatusMappings = {
  ORDER_TO_SHIPMENT_STATUS,
  SHIPMENT_TO_ORDER_STATUS,
};
