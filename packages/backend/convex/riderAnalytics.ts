import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

async function isRider(
  ctx: QueryCtx | MutationCtx,
  user: { role_id?: Id<"roles"> } | null,
): Promise<boolean> {
  if (!user?.role_id) return false;
  const role = await ctx.db.get(user.role_id);
  return role?.name === "Rider";
}

// Type guard to check if object is an order
const isOrder = (
  obj: any,
): obj is { total_amount: number; payment_method: string } => {
  return (
    obj &&
    typeof obj === "object" &&
    "total_amount" in obj &&
    "payment_method" in obj
  );
};

// Get rider's daily statistics
export const getRiderDailyStats = query({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // Get all rider's deliveries
    const allDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    // Filter for today's deliveries
    const todaysDeliveries = allDeliveries.filter((delivery) => {
      const deliveryDate = new Date(delivery.updated_at);
      deliveryDate.setHours(0, 0, 0, 0);
      return deliveryDate.getTime() >= todayTimestamp;
    });

    // Active deliveries (not delivered or failed)
    const activeDeliveries = allDeliveries.filter(
      (d) =>
        d.status === "Awaiting Pickup" ||
        d.status === "Picked Up" ||
        d.status === "Out for Delivery",
    );

    // Completed today
    const completedToday = todaysDeliveries.filter(
      (d) => d.status === "Delivered",
    );

    // Get orders for earnings calculation
    const orderIds = completedToday.map((d) => d.order_id);
    const orders = await Promise.all(
      orderIds.map((orderId) => ctx.db.get(orderId)),
    );

    // Calculate today's earnings (delivery fees from completed orders)
    const todaysEarnings = orders.reduce((total, order) => {
      return order ? total + (order.delivery_fee || 0) : total;
    }, 0);

    return {
      active: activeDeliveries.length,
      completedToday: completedToday.length,
      todaysEarnings: todaysEarnings,
    };
  },
});

// Get rider's performance statistics
export const getRiderPerformanceStats = query({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    const allDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    const totalDeliveries = allDeliveries.length;
    const completedDeliveries = allDeliveries.filter(
      (d) => d.status === "Delivered",
    ).length;
    const failedDeliveries = allDeliveries.filter(
      (d) => d.status === "Failed Delivery",
    ).length;

    // Calculate completion rate
    const completionRate =
      totalDeliveries > 0
        ? Math.round((completedDeliveries / totalDeliveries) * 100)
        : 0;

    // Calculate on-time rate (simplified - assuming all completed deliveries are on-time for now)
    const onTimeRate = completionRate; // This would need more sophisticated logic with time tracking

    // Get rider details for rating
    const rider = await ctx.db.get(args.riderId);
    const rating = rider?.rider_details?.rating || 0;

    return {
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      completionRate,
      onTimeRate,
      rating,
    };
  },
});

// Get rider's weekly statistics
export const getRiderWeeklyStats = query({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const allDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    // Filter for this week
    const weeklyDeliveries = allDeliveries.filter((delivery) => {
      const deliveryDate = new Date(delivery.updated_at);
      return deliveryDate >= weekAgo;
    });

    const completed = weeklyDeliveries.filter((d) => d.status === "Delivered");

    // Get orders for earnings
    const orderIds = completed.map((d) => d.order_id);
    const orders = await Promise.all(
      orderIds.map((orderId) => ctx.db.get(orderId)),
    );

    const weeklyEarnings = orders.reduce((total, order) => {
      return order ? total + (order.delivery_fee || 0) : total;
    }, 0);

    return {
      weeklyDeliveries: completed.length,
      weeklyEarnings,
    };
  },
});

// Update rider online/offline status
export const updateRiderOnlineStatus = mutation({
  args: {
    riderId: v.id("users"),
    isOnline: v.boolean(),
  },
  handler: async (ctx, args) => {
    const rider = await ctx.db.get(args.riderId);
    if (!rider || !(await isRider(ctx, rider))) {
      throw new Error("Rider not found");
    }

    const newStatus = args.isOnline ? "Active" : "Inactive";

    const currentDetails = rider.rider_details || {
      vehicle_type: "Motorbike" as const,
      status: "Inactive" as const,
    };

    await ctx.db.patch(args.riderId, {
      rider_details: {
        ...currentDetails,
        status: newStatus,
      },
      updated_at: Date.now(),
    });

    return {
      success: true,
      isOnline: args.isOnline,
      status: newStatus,
    };
  },
});

// Get rider's recent activity
export const getRiderRecentActivity = query({
  args: {
    riderId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 5;

    const all = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    const recentDeliveries = all
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
      .slice(0, limit);

    // Enrich with order details
    const enrichedActivity = await Promise.all(
      recentDeliveries.map(async (shipment) => {
        const order = await ctx.db.get(shipment.order_id);
        const customer = order ? await ctx.db.get(order.user_id) : null;

        return {
          ...shipment,
          order_ref: order?.reference,
          customer_name: customer
            ? `${customer.first_name} ${customer.last_name}`.trim()
            : "Unknown Customer",
          total_amount: order?.total_amount || 0,
        };
      }),
    );

    return enrichedActivity;
  },
});

// Get delivery time analytics
export const getDeliveryTimeStats = query({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    const completedDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider_status", (q) =>
        q.eq("rider_id", args.riderId).eq("status", "Delivered"),
      )
      .collect();

    if (completedDeliveries.length === 0) {
      return {
        averageTime: 0,
        fastestTime: 0,
        totalHours: 0,
      };
    }

    // Get today's date for filtering today's activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // Filter deliveries completed today
    const todaysDeliveries = completedDeliveries.filter((delivery) => {
      const deliveryDate = new Date(delivery.updated_at);
      deliveryDate.setHours(0, 0, 0, 0);
      return deliveryDate.getTime() >= todayTimestamp;
    });

    // Calculate delivery times with more realistic estimates based on order data
    const deliveryTimes = await Promise.all(
      completedDeliveries.map(async (delivery) => {
        const order = await ctx.db.get(delivery.order_id);

        // Base delivery time: 20-45 minutes depending on order complexity
        let estimatedTime = 25; // Base time in minutes

        if (isOrder(order)) {
          // Add time based on order value (higher value = more items = more time)
          if (order.total_amount > 50) estimatedTime += 10;
          if (order.total_amount > 100) estimatedTime += 15;

          // Add time for payment method (COD takes longer)
          if (order.payment_method === "Cash on Delivery") estimatedTime += 5;
        }

        // Add some randomness to simulate real-world variation (±5 minutes)
        const variation = Math.floor(Math.random() * 10) - 5;
        return Math.max(15, estimatedTime + variation); // Minimum 15 minutes
      }),
    );

    const averageTime =
      deliveryTimes.reduce((sum, time) => sum + time, 0) / deliveryTimes.length;
    const fastestTime = Math.min(...deliveryTimes);

    // Calculate active hours today based on actual deliveries completed today
    const todaysHours =
      todaysDeliveries.length > 0
        ? (todaysDeliveries.length * averageTime) / 60 // Convert minutes to hours
        : 0;

    return {
      averageTime: Math.round(averageTime),
      fastestTime,
      totalHours: Math.round(todaysHours * 10) / 10, // Round to 1 decimal, showing today's hours
    };
  },
});

// Get comprehensive active hours breakdown
export const getActiveHoursBreakdown = query({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    const rider = await ctx.db.get(args.riderId);
    if (!rider || !(await isRider(ctx, rider))) {
      return { todayHours: 0, weekHours: 0, totalHours: 0 };
    }

    const allDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    const completedDeliveries = allDeliveries.filter(
      (d) => d.status === "Delivered",
    );

    if (completedDeliveries.length === 0) {
      return { todayHours: 0, weekHours: 0, totalHours: 0 };
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Calculate estimated time per delivery based on order data
    const calculateDeliveryTime = async (delivery: any): Promise<number> => {
      const order = await ctx.db.get(delivery.order_id);
      let estimatedMinutes = 25; // Base time

      if (isOrder(order)) {
        // Order complexity factors
        if (order.total_amount > 50) estimatedMinutes += 8;
        if (order.total_amount > 100) estimatedMinutes += 12;
        if (order.payment_method === "Cash on Delivery") estimatedMinutes += 5;

        // Distance factor (simplified - could use actual coordinates)
        // For now, assume suburban/urban differences
        if (order.total_amount > 150) estimatedMinutes += 10; // Likely longer distance
      }

      return Math.max(15, estimatedMinutes); // Minimum 15 minutes per delivery
    };

    // Today's deliveries
    const todaysDeliveries = completedDeliveries.filter((delivery) => {
      const deliveryDate = new Date(delivery.updated_at);
      return deliveryDate >= today;
    });

    // This week's deliveries
    const weekDeliveries = completedDeliveries.filter((delivery) => {
      const deliveryDate = new Date(delivery.updated_at);
      return deliveryDate >= weekAgo;
    });

    // Calculate hours for each period
    const todayTimes = await Promise.all(
      todaysDeliveries.map(calculateDeliveryTime),
    );
    const weekTimes = await Promise.all(
      weekDeliveries.map(calculateDeliveryTime),
    );
    const totalTimes = await Promise.all(
      completedDeliveries.map(calculateDeliveryTime),
    );

    const todayHours = todayTimes.reduce((sum, time) => sum + time, 0) / 60;
    const weekHours = weekTimes.reduce((sum, time) => sum + time, 0) / 60;
    const totalHours = totalTimes.reduce((sum, time) => sum + time, 0) / 60;

    return {
      todayHours: Math.round(todayHours * 10) / 10,
      weekHours: Math.round(weekHours * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
      todayDeliveries: todaysDeliveries.length,
      weekDeliveries: weekDeliveries.length,
      totalDeliveries: completedDeliveries.length,
    };
  },
});

// Get rider dashboard summary
export const getRiderDashboard = query({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    // Get rider details
    const rider = await ctx.db.get(args.riderId);
    if (!rider || !(await isRider(ctx, rider))) {
      throw new Error("Rider not found");
    }

    // Get daily stats - call the handlers directly instead of using runQuery
    const allDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider", (q) => q.eq("rider_id", args.riderId))
      .collect();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const todaysDeliveries = allDeliveries.filter((delivery) => {
      const deliveryDate = new Date(delivery.updated_at);
      deliveryDate.setHours(0, 0, 0, 0);
      return deliveryDate.getTime() >= todayTimestamp;
    });

    const activeDeliveries = allDeliveries.filter(
      (d) =>
        d.status === "Awaiting Pickup" ||
        d.status === "Picked Up" ||
        d.status === "Out for Delivery",
    );

    const completedToday = todaysDeliveries.filter(
      (d) => d.status === "Delivered",
    );

    const orderIds = completedToday.map((d) => d.order_id);
    const orders = await Promise.all(
      orderIds.map((orderId) => ctx.db.get(orderId)),
    );

    const todaysEarnings = orders.reduce((total, order) => {
      return order ? total + (order.delivery_fee || 0) : total;
    }, 0);

    const dailyStats = {
      active: activeDeliveries.length,
      completedToday: completedToday.length,
      todaysEarnings: todaysEarnings,
    };

    // Get performance stats
    const totalDeliveries = allDeliveries.length;
    const completedDeliveries = allDeliveries.filter(
      (d) => d.status === "Delivered",
    ).length;
    const failedDeliveries = allDeliveries.filter(
      (d) => d.status === "Failed Delivery",
    ).length;

    const completionRate =
      totalDeliveries > 0
        ? Math.round((completedDeliveries / totalDeliveries) * 100)
        : 0;

    const onTimeRate = completionRate;
    const rating = rider?.rider_details?.rating || 0;

    const performanceStats = {
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      completionRate,
      onTimeRate,
      rating,
    };

    // Get next pending deliveries
    const nextDeliveries = await ctx.db
      .query("shipments")
      .withIndex("by_rider_status", (q) =>
        q.eq("rider_id", args.riderId).eq("status", "Awaiting Pickup"),
      )
      .take(3);

    const enrichedNextDeliveries = await Promise.all(
      nextDeliveries.map(async (shipment) => {
        const order = await ctx.db.get(shipment.order_id);
        const customer = order ? await ctx.db.get(order.user_id) : null;

        return {
          ...shipment,
          order_ref: order?.reference,
          customer_name: customer
            ? `${customer.first_name} ${customer.last_name}`.trim()
            : "Unknown Customer",
        };
      }),
    );

    return {
      rider: {
        name: `${rider.first_name} ${rider.last_name}`,
        status: rider.rider_details?.status || "Inactive",
        vehicleType: rider.rider_details?.vehicle_type || "Motorbike",
        rating: rider.rider_details?.rating || 0,
      },
      dailyStats,
      performanceStats,
      nextDeliveries: enrichedNextDeliveries,
    };
  },
});
