import {
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUser } from "../auth.helpers";
import { Id } from "../_generated/dataModel";

/**
 * Get detailed shipment tracking information including rider location
 */
/**
 * @internal Was a public, unauthenticated query. It joins the FULL rider and customer rows — names, phones, coordinates — and returned them to any anonymous caller holding a shipment id.
 *
 * Zero callers in any app, so it is closed rather than gated. Customer-facing
 * tracking goes through `getMyOrderTracking` below, which is owner-scoped and
 * returns only what a customer needs to see.
 */
export const getShipmentTracking = internalQuery({
  args: {
    shipmentId: v.id("shipments"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) {
      return null;
    }

    // Get related data in parallel
    const [rider, order, vendor, customer] = await Promise.all([
      ctx.db.get(shipment.rider_id),
      ctx.db.get(shipment.order_id),
      ctx.db.get(shipment.vendor_id),
      shipment.order_id
        ? ctx.db
            .get(shipment.order_id)
            .then((o) => (o ? ctx.db.get(o.user_id) : null))
        : null,
    ]);

    // Get vendor coordinates from vendor data
    const pickupCoordinates = vendor?.coordinates
      ? {
          lat: vendor.coordinates.lat,
          lng: vendor.coordinates.lng,
        }
      : null;

    return {
      shipment: {
        ...shipment,
        pickup_coordinates: pickupCoordinates,
      },
      rider: rider
        ? {
            _id: rider._id,
            first_name: rider.first_name,
            last_name: rider.last_name,
            phone: rider.phone,
            email: rider.email,
            image: rider.image,
            rating: rider.rider_details?.rating || 5.0,
            vehicle_type: rider.rider_details?.vehicle_type,
            vehicle_plate: rider.rider_details?.vehicle_plate,
            current_location: rider.rider_details?.coordinates || null,
          }
        : null,
      order: order
        ? {
            _id: order._id,
            reference: order.reference,
            total_amount: order.total_amount,
            order_status: order.order_status,
            special_instructions: order.special_instructions,
          }
        : null,
      vendor: vendor
        ? {
            _id: vendor._id,
            name: vendor.name,
            address: vendor.address,
            coordinates: vendor.coordinates,
          }
        : null,
      customer: customer
        ? {
            _id: customer._id,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone,
          }
        : null,
    };
  },
});

/**
 * Get real-time rider location for a specific shipment
 */
/**
 * @internal Was a public, unauthenticated query. It returned a rider's LIVE GPS coordinates to any anonymous caller holding a shipment id. Shipment ids are not secrets.
 *
 * Zero callers in any app, so it is closed rather than gated. Customer-facing
 * tracking goes through `getMyOrderTracking` below, which is owner-scoped and
 * returns only what a customer needs to see.
 */
export const getRiderLocation = internalQuery({
  args: {
    shipmentId: v.id("shipments"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) {
      return null;
    }

    const rider = await ctx.db.get(shipment.rider_id);
    if (!rider || !rider.rider_details?.coordinates) {
      return null;
    }

    return {
      riderId: rider._id,
      coordinates: rider.rider_details.coordinates,
      lastUpdated: Date.now(),
      status: rider.rider_details.status,
    };
  },
});

/**
 * Update rider's real-time location (called by rider app)
 */
/**
 * A rider reporting their own position.
 *
 * ── What this closes ─────────────────────────────────────────────────────
 *
 * It took `riderId` as an ARGUMENT with no auth check, and validated only that
 * the TARGET is a rider — never that the caller is. So anyone could move any
 * rider anywhere on the map: falsify a delivery's progress, or make a rider
 * appear somewhere they have never been.
 *
 * The id is now derived from the auth token and the argument is removed. Zero
 * callers in any app, so nothing legitimate breaks.
 */
export const updateRiderLocation = mutation({
  args: {
    coordinates: v.object({
      lat: v.float64(),
      lng: v.float64(),
    }),
  },
  handler: async (ctx, args) => {
    const { user: authed } = await getAuthUser(ctx);
    const riderRole = authed.role_id ? await ctx.db.get(authed.role_id) : null;
    if (riderRole?.name !== "Rider") {
      throw new ConvexError("Only a rider can report a rider location");
    }
    // Re-read the full row: getAuthUser widens `rider_details`, and the patch
    // below spreads it.
    const rider = await ctx.db.get(authed._id);
    if (!rider) throw new ConvexError("Rider not found");

    // Update rider's location
    await ctx.db.patch(rider._id, {
      rider_details: {
        ...rider.rider_details,
        coordinates: args.coordinates,
        status: rider.rider_details?.status || "Active",
        vehicle_type: rider.rider_details?.vehicle_type || "Bicycle",
      },
      updated_at: Date.now(),
    });

    return {
      success: true,
      coordinates: args.coordinates,
      timestamp: Date.now(),
    };
  },
});

/**
 * Get delivery timeline/status history for a shipment
 */
/**
 * @internal Was a public, unauthenticated query. It exposes the full delivery history of any shipment.
 *
 * Zero callers in any app, so it is closed rather than gated. Customer-facing
 * tracking goes through `getMyOrderTracking` below, which is owner-scoped and
 * returns only what a customer needs to see.
 */
export const getDeliveryTimeline = internalQuery({
  args: {
    shipmentId: v.id("shipments"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) {
      return [];
    }

    const order = shipment.order_id
      ? await ctx.db.get(shipment.order_id)
      : null;

    // Build timeline based on shipment status and timestamps
    const timeline = [];

    // Order placed (from order data)
    if (order) {
      timeline.push({
        status: "Order Placed",
        timestamp: order.order_date,
        completed: true,
        description: "Your order has been confirmed",
        icon: "check-circle",
      });

      if (order.order_status !== "Pending") {
        timeline.push({
          status: "Processing",
          timestamp: order.order_date + 15 * 60 * 1000,
          completed: true,
          description: "Order is being prepared by vendor",
          icon: "clock-o",
        });
      }
    }

    type DisplayStage = {
      status: string;
      dbStatuses: string[];
      description: string;
      icon: string;
    };

    const displayStages: DisplayStage[] = [
      {
        status: "Awaiting Pickup",
        dbStatuses: ["Awaiting Pickup"],
        description: "Rider assigned, heading to pickup",
        icon: "user",
      },
      {
        status: "Out for Delivery",
        dbStatuses: ["Picked Up", "Out for Delivery"],
        description: "Order is on delivery",
        icon: "truck",
      },
      {
        status: "Delivered",
        dbStatuses: ["Delivered"],
        description: "Order delivered successfully",
        icon: "check",
      },
    ];

    const underlyingOrder = [
      "Awaiting Pickup",
      "Picked Up",
      "Out for Delivery",
      "Delivered",
    ];
    const currentUnderlyingIndex = underlyingOrder.indexOf(shipment.status);

    displayStages.forEach((stage, idx) => {
      const stageMinIndex = Math.min(
        ...stage.dbStatuses
          .map((s) => underlyingOrder.indexOf(s))
          .filter((i) => i >= 0),
      );
      const stageMaxIndex = Math.max(
        ...stage.dbStatuses
          .map((s) => underlyingOrder.indexOf(s))
          .filter((i) => i >= 0),
      );
      const isCurrent = stage.dbStatuses.includes(shipment.status);
      const isCompleted =
        stageMaxIndex < currentUnderlyingIndex ||
        shipment.status === "Delivered";

      timeline.push({
        status: stage.status,
        description: stage.description,
        icon: stage.icon,
        timestamp:
          isCompleted || isCurrent
            ? shipment.updated_at -
              (currentUnderlyingIndex - stageMinIndex) * 10 * 60 * 1000
            : null,
        completed: isCompleted,
        current: isCurrent,
      });
    });

    return timeline.sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) return 0;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return a.timestamp - b.timestamp;
    });
  },
});

/**
 * @internal Was a public, unauthenticated query. It exposes rider position indirectly via the ETA.
 *
 * Zero callers in any app, so it is closed rather than gated. Customer-facing
 * tracking goes through `getMyOrderTracking` below, which is owner-scoped and
 * returns only what a customer needs to see.
 */
export const getEstimatedDeliveryTime = internalQuery({
  args: {
    shipmentId: v.id("shipments"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.status === "Delivered") {
      return null;
    }

    const rider = await ctx.db.get(shipment.rider_id);
    if (!rider || !rider.rider_details?.coordinates) {
      return { estimated_minutes: null, status: "Unknown" };
    }

    const riderLocation = rider.rider_details.coordinates;
    const deliveryLocation = shipment.delivery_address;

    // Simple estimation based on status and distance (mock calculation)
    let estimatedMinutes = 30; // Default fallback

    if (deliveryLocation.lat && deliveryLocation.lng) {
      // Calculate approximate distance (simple Haversine distance)
      const R = 6371; // Earth's radius in km
      const dLat = ((deliveryLocation.lat - riderLocation.lat) * Math.PI) / 180;
      const dLon = ((deliveryLocation.lng - riderLocation.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((riderLocation.lat * Math.PI) / 180) *
          Math.cos((deliveryLocation.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c; // Distance in km

      // Estimate time based on average city speed (20 km/h for motorcycles)
      const averageSpeed = 20;
      estimatedMinutes = Math.ceil((distance / averageSpeed) * 60);

      // Adjust based on status
      switch (shipment.status) {
        case "Awaiting Pickup":
          estimatedMinutes += 15; // Add pickup time
          break;
        case "Picked Up":
          estimatedMinutes += 10; // Add preparation time
          break;
        case "Out for Delivery":
          // Use calculated time as-is
          break;
        default:
          estimatedMinutes = 30;
      }
    }

    return {
      estimated_minutes: Math.max(5, Math.min(estimatedMinutes, 120)), // Between 5-120 minutes
      status: shipment.status,
      last_updated: Date.now(),
    };
  },
});

/**
 * Get all active deliveries for tracking overview (admin/customer service)
 */
/**
 * @internal Was a public, unauthenticated query. It lists every in-flight delivery on the platform.
 *
 * Zero callers in any app, so it is closed rather than gated. Customer-facing
 * tracking goes through `getMyOrderTracking` below, which is owner-scoped and
 * returns only what a customer needs to see.
 */
export const getActiveDeliveries = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    const activeShipments = await ctx.db
      .query("shipments")
      .withIndex("by_status", (q) => q.eq("status", "Out for Delivery"))
      .take(limit);

    const enrichedShipments = await Promise.all(
      activeShipments.map(async (shipment) => {
        const [rider, order, vendor] = await Promise.all([
          ctx.db.get(shipment.rider_id),
          ctx.db.get(shipment.order_id),
          ctx.db.get(shipment.vendor_id),
        ]);

        const customer = order ? await ctx.db.get(order.user_id) : null;

        return {
          shipment: {
            ...shipment,
            rider_location: rider?.rider_details?.coordinates || null,
          },
          rider: rider
            ? {
                name: `${rider.first_name} ${rider.last_name}`,
                phone: rider.phone,
                vehicle: rider.rider_details?.vehicle_type,
              }
            : null,
          order: order
            ? {
                reference: order.reference,
                total: order.total_amount,
              }
            : null,
          customer: customer
            ? {
                name: `${customer.first_name} ${customer.last_name}`,
                phone: customer.phone,
              }
            : null,
          vendor: vendor
            ? {
                name: vendor.name,
              }
            : null,
        };
      }),
    );

    return enrichedShipments;
  },
});

/**
 * Mark shipment as delivered with delivery confirmation
 */
export const confirmDelivery = mutation({
  args: {
    shipmentId: v.id("shipments"),
    riderId: v.id("users"),
    deliveryNotes: v.optional(v.string()),
    customerSignature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) {
      throw new Error("Shipment not found");
    }

    // Verify rider
    if (shipment.rider_id !== args.riderId) {
      throw new Error("Unauthorized: Not assigned to this delivery");
    }

    // Update shipment status
    await ctx.db.patch(args.shipmentId, {
      status: "Delivered",
      updated_at: Date.now(),
    });

    // Update related order status
    if (shipment.order_id) {
      await ctx.db.patch(shipment.order_id, {
        order_status: "Delivered",
        updated_at: Date.now(),
      });
    }

    // Update rider status back to Active
    const rider = await ctx.db.get(args.riderId);
    if (rider && rider.rider_details) {
      await ctx.db.patch(rider._id, {
        rider_details: {
          ...rider.rider_details,
          status: "Active",
        },
        updated_at: Date.now(),
      });
    }

    return {
      success: true,
      message: "Delivery confirmed successfully",
      deliveryTime: Date.now(),
    };
  },
});

/**
 * Tracking for one of the caller's own orders.
 *
 * ── What a customer needs, and nothing else ──────────────────────────────
 *
 * The queries above joined whole rows: the rider's full record (including their
 * own address and status), and the customer's. A customer tracking a delivery
 * needs to know where their parcel is, roughly when it arrives, and how to
 * reach the person carrying it — not the rider's employment details.
 *
 * So this returns a deliberately narrow projection. It is the same principle
 * applied elsewhere in this backend: the rider app must not see a vendor's
 * commission, and a customer must not see a rider's record.
 */
export const getMyOrderTracking = query({
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
    // Null rather than a throw for someone else's order, so the screen shows
    // "not found" without confirming the id exists.
    if (!order || order.user_id !== user._id) return null;

    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .first();

    const rider = shipment?.rider_id
      ? await ctx.db.get(shipment.rider_id)
      : null;

    // Position is withheld until the parcel is actually moving. Before that it
    // says nothing useful about the delivery and is only the rider's location.
    // "Out for Delivery" is the real enum value — there is no "In Transit".
    // The typechecker caught that, which is the argument for narrow unions.
    const isEnRoute =
      order.order_status === "Delivery" ||
      shipment?.status === "Out for Delivery";

    return {
      orderStatus: order.order_status,
      paymentStatus: order.payment_status,
      shipmentStatus: shipment?.status ?? null,
      // First name only. A customer needs to recognise who is at the door, not
      // to be able to look the rider up.
      riderFirstName: rider?.first_name ?? null,
      riderPhone: isEnRoute ? (rider?.phone ?? null) : null,
      riderPosition:
        isEnRoute && rider?.rider_details?.coordinates
          ? rider.rider_details.coordinates
          : null,
      vehicleType: rider?.rider_details?.vehicle_type ?? null,
      /** Set when the order needs a code read out at the door. */
      deliveryCodeRequired:
        order.payment_mode === "pay_now" && !order.delivery_code_verified,
      updatedAt: shipment?.updated_at ?? order.updated_at,
    };
  },
});
