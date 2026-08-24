import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Get detailed shipment tracking information including rider location
 */
export const getShipmentTracking = query({
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
export const getRiderLocation = query({
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
export const updateRiderLocation = mutation({
  args: {
    riderId: v.id("users"),
    coordinates: v.object({
      lat: v.float64(),
      lng: v.float64(),
    }),
  },
  handler: async (ctx, args) => {
    const rider = await ctx.db.get(args.riderId);
    const riderRole = rider?.role_id ? await ctx.db.get(rider.role_id) : null;
    if (!rider || riderRole?.name !== "Rider") {
      throw new Error("Invalid rider");
    }

    // Update rider's location
    await ctx.db.patch(args.riderId, {
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
export const getDeliveryTimeline = query({
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

export const getEstimatedDeliveryTime = query({
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
export const getActiveDeliveries = query({
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
      await ctx.db.patch(args.riderId, {
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
