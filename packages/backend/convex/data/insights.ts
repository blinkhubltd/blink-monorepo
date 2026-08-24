import { query } from "../_generated/server";
import { v } from "convex/values";

export const TimeRange = v.union(
  v.literal("today"),
  v.literal("yesterday"),
  v.literal("thisWeek"),
  v.literal("lastWeek"),
  v.literal("thisMonth"),
  v.literal("lastMonth"),
  v.literal("thisYear"),
  v.literal("lastYear"),
  v.literal("all"),
);

export const getSalesAnalytics = query({
  args: {
    timeRange: v.optional(TimeRange),
    vendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let startDate = 0;
    let endDate = now;

    switch (args.timeRange) {
      case "today":
        startDate = new Date().setHours(0, 0, 0, 0);
        break;
      case "yesterday":
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.setHours(0, 0, 0, 0)).getTime();
        endDate = new Date(yesterday.setHours(23, 59, 59, 999)).getTime();
        break;
      case "thisWeek":
        const thisWeek = new Date();
        startDate = new Date(
          thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay()),
        ).setHours(0, 0, 0, 0);
        break;
      case "lastWeek":
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        startDate = new Date(
          lastWeek.setDate(lastWeek.getDate() - lastWeek.getDay()),
        ).setHours(0, 0, 0, 0);
        endDate = new Date(lastWeek.setDate(lastWeek.getDate() + 6)).setHours(
          23,
          59,
          59,
          999,
        );
        break;
      case "thisMonth":
        const thisMonth = new Date();
        startDate = new Date(
          thisMonth.getFullYear(),
          thisMonth.getMonth(),
          1,
        ).getTime();
        break;
      case "lastMonth":
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        startDate = new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth(),
          1,
        ).getTime();
        endDate = new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth() + 1,
          0,
        ).setHours(23, 59, 59, 999);
        break;
      case "thisYear":
        const thisYear = new Date();
        startDate = new Date(thisYear.getFullYear(), 0, 1).getTime();
        break;
      case "lastYear":
        const lastYear = new Date().getFullYear() - 1;
        startDate = new Date(lastYear, 0, 1).getTime();
        endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999).getTime();
        break;
    }

    let orders;

    if (args.timeRange && args.timeRange !== "all" && args.vendorId) {
      const vendorId = args.vendorId; // Create a new variable to help TypeScript with type narrowing
      orders = await ctx.db
        .query("orders")
        .withIndex("by_order_date", (q) =>
          q.gte("order_date", startDate).lte("order_date", endDate),
        )
        .filter((q) => q.eq(q.field("vendor_id"), vendorId))
        .collect();
    }
    // Handle only time range filter
    else if (args.timeRange && args.timeRange !== "all") {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_order_date", (q) =>
          q.gte("order_date", startDate).lte("order_date", endDate),
        )
        .collect();
    }
    // Handle only vendor filter
    else if (args.vendorId) {
      const vendorId = args.vendorId; // Create a new variable to help TypeScript with type narrowing
      orders = await ctx.db
        .query("orders")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", vendorId))
        .collect();
    } else {
      orders = await ctx.db.query("orders").collect();
    }

    // Calculate metrics
    const totalSales = orders.reduce(
      (sum, order) => sum + order.total_amount,
      0,
    );
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Group by status
    const statusCounts = orders.reduce(
      (acc, order) => {
        acc[order.order_status] = (acc[order.order_status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Group by payment method
    const paymentMethodCounts = orders.reduce(
      (acc, order) => {
        acc[order.payment_method] = (acc[order.payment_method] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Group by date for time series
    const salesByDate = orders.reduce(
      (acc, order) => {
        const date = new Date(order.order_date).toISOString().split("T")[0];
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += order.total_amount;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Convert to array for the frontend
    const salesTrend = Object.entries(salesByDate).map(([date, amount]) => ({
      date,
      amount,
    }));

    return {
      totalSales,
      totalOrders,
      avgOrderValue,
      statusCounts,
      paymentMethodCounts,
      salesTrend,
      startDate,
      endDate,
    };
  },
});

// Get rider performance metrics
export const getRiderPerformance = query({
  args: {
    timeRange: v.optional(TimeRange),
  },
  handler: async (ctx, args) => {
    // Get all riders
    const riderRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Rider"))
      .unique();
    const riders = riderRole
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", riderRole._id))
          .collect()
      : [];

    // Get all orders for the time range
    const orders = await ctx.db.query("orders").collect();
    const shipments = await ctx.db.query("shipments").collect();

    // Get current time for active status calculation
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000; // 1 hour ago

    // Calculate metrics for each rider
    const riderMetrics = await Promise.all(
      riders.map(async (rider) => {
        const riderOrders = orders.filter(
          (order) => order.rider_id === rider._id,
        );
        const riderShipments = shipments.filter(
          (shipment) => shipment.rider_id === rider._id,
        );

        // Calculate delivery completion rate
        const completedDeliveries = riderShipments.filter(
          (s) => s.status === "Delivered",
        ).length;
        const totalDeliveries = riderShipments.length;
        const completionRate =
          totalDeliveries > 0
            ? (completedDeliveries / totalDeliveries) * 100
            : 0;

        // Calculate delivery metrics using updated_at timestamp
        let avgDeliveryTime = 0;
        let totalDeliveryTime = 0;
        let validDeliveries = 0;

        // Calculate average time between order creation and delivery
        for (const shipment of riderShipments) {
          const order = orders.find((o) => o._id === shipment.order_id);
          if (
            order &&
            shipment.status === "Delivered" &&
            order.order_date &&
            shipment.updated_at
          ) {
            const deliveryTime = shipment.updated_at - order.order_date;
            if (deliveryTime > 0) {
              totalDeliveryTime += deliveryTime;
              validDeliveries++;
            }
          }
        }

        avgDeliveryTime =
          validDeliveries > 0 ? totalDeliveryTime / validDeliveries : 0;

        // Check if rider is currently active (had an update in the last hour)
        const isActive = rider.updated_at
          ? rider.updated_at > oneHourAgo
          : false;

        return {
          riderId: rider._id,
          name: `${rider.first_name} ${rider.last_name}`,
          totalDeliveries,
          completedDeliveries,
          completionRate,
          avgDeliveryTime, // in milliseconds
          status: rider.rider_details?.status || "Inactive",
          isActive,
          vehicleType: rider.rider_details?.vehicle_type || "Unknown",
        };
      }),
    );

    return riderMetrics;
  },
});

// Get product performance metrics
export const getProductPerformance = query({
  args: {
    timeRange: v.optional(TimeRange),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get all order items
    const orderItems = await ctx.db.query("order_items").collect();
    const products = await ctx.db.query("products").collect();
    const orders = await ctx.db.query("orders").collect();

    // Create a map of product ID to product details
    const productMap = new Map(
      products.map((product) => [product._id.toString(), product]),
    );

    // Create a map of order ID to order date
    const orderDateMap = new Map(
      orders.map((order) => [order._id.toString(), order.order_date]),
    );

    // Filter order items by time range if specified
    const filteredItems = args.timeRange
      ? orderItems.filter((item) => {
          const orderDate = orderDateMap.get(item.order_id.toString());
          if (!orderDate) return false;

          const now = Date.now();
          let startDate = 0;

          // Simplified time range check (same logic as in getSalesAnalytics)
          switch (args.timeRange) {
            case "today":
              startDate = new Date().setHours(0, 0, 0, 0);
              break;
            case "thisWeek":
              const thisWeek = new Date();
              startDate = new Date(
                thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay()),
              ).setHours(0, 0, 0, 0);
              break;
            case "thisMonth":
              const thisMonth = new Date();
              startDate = new Date(
                thisMonth.getFullYear(),
                thisMonth.getMonth(),
                1,
              ).getTime();
              break;
            case "thisYear":
              const thisYear = new Date();
              startDate = new Date(thisYear.getFullYear(), 0, 1).getTime();
              break;
            default:
              return true; // Include all items for other time ranges
          }

          return orderDate >= startDate && orderDate <= now;
        })
      : orderItems;

    // Calculate product metrics
    const productMetrics = Array.from(
      filteredItems.reduce((acc, item) => {
        const productId = item.product_id.toString();
        const product = productMap.get(productId);

        if (!product) return acc;

        const existing = acc.get(productId) || {
          productId,
          name: product.name,
          sku: product.sku,
          categoryId: product.category_id,
          totalQuantity: 0,
          totalRevenue: 0,
          orderCount: 0,
        };

        existing.totalQuantity += item.quantity;
        existing.totalRevenue += item.total;
        existing.orderCount++;

        acc.set(productId, existing);
        return acc;
      }, new Map()),
    ).map(([_, value]) => value);

    // Sort by revenue (descending)
    productMetrics.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Apply limit if specified
    if (args.limit) {
      return productMetrics.slice(0, args.limit);
    }

    return productMetrics;
  },
});

// Get order status distribution
export const getOrderStatusDistribution = query({
  args: {
    timeRange: v.optional(TimeRange),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let startDate = 0;
    let endDate = now;

    // Apply time range filtering (same logic as other queries)
    switch (args.timeRange) {
      case "today":
        startDate = new Date().setHours(0, 0, 0, 0);
        break;
      case "yesterday":
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.setHours(0, 0, 0, 0)).getTime();
        endDate = new Date(yesterday.setHours(23, 59, 59, 999)).getTime();
        break;
      case "thisWeek":
        const thisWeek = new Date();
        startDate = new Date(
          thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay()),
        ).setHours(0, 0, 0, 0);
        break;
      case "lastWeek":
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        startDate = new Date(
          lastWeek.setDate(lastWeek.getDate() - lastWeek.getDay()),
        ).setHours(0, 0, 0, 0);
        endDate = new Date(lastWeek.setDate(lastWeek.getDate() + 6)).setHours(
          23,
          59,
          59,
          999,
        );
        break;
      case "thisMonth":
        const thisMonth = new Date();
        startDate = new Date(
          thisMonth.getFullYear(),
          thisMonth.getMonth(),
          1,
        ).getTime();
        break;
      case "lastMonth":
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        startDate = new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth(),
          1,
        ).getTime();
        endDate = new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth() + 1,
          0,
        ).setHours(23, 59, 59, 999);
        break;
      case "thisYear":
        const thisYear = new Date();
        startDate = new Date(thisYear.getFullYear(), 0, 1).getTime();
        break;
      case "lastYear":
        const lastYear = new Date().getFullYear() - 1;
        startDate = new Date(lastYear, 0, 1).getTime();
        endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999).getTime();
        break;
    }

    let orders;

    // Get orders based on time range
    if (args.timeRange && args.timeRange !== "all") {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_order_date", (q) =>
          q.gte("order_date", startDate).lte("order_date", endDate),
        )
        .collect();
    } else {
      orders = await ctx.db.query("orders").collect();
    }

    const statusCounts = orders.reduce(
      (acc, order) => {
        acc[order.order_status] = (acc[order.order_status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return statusCounts;
  },
});

export const getVendorBreakdown = query({
  args: {
    vendorId: v.id("vendors"),
    timeRange: v.optional(TimeRange),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      return null;
    }

    const now = Date.now();
    let startDate = 0;
    let endDate = now;

    if (args.timeRange && args.timeRange !== "all") {
      switch (args.timeRange) {
        case "today":
          startDate = new Date().setHours(0, 0, 0, 0);
          break;
        case "yesterday":
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = new Date(yesterday.setHours(0, 0, 0, 0)).getTime();
          endDate = new Date(yesterday.setHours(23, 59, 59, 999)).getTime();
          break;
        case "thisWeek":
          const thisWeek = new Date();
          startDate = new Date(
            thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay()),
          ).setHours(0, 0, 0, 0);
          break;
        case "lastWeek":
          const lastWeek = new Date();
          lastWeek.setDate(lastWeek.getDate() - 7);
          startDate = new Date(
            lastWeek.setDate(lastWeek.getDate() - lastWeek.getDay()),
          ).setHours(0, 0, 0, 0);
          endDate = new Date(lastWeek.setDate(lastWeek.getDate() + 6)).setHours(
            23,
            59,
            59,
            999,
          );
          break;
        case "thisMonth":
          const thisMonth = new Date();
          startDate = new Date(
            thisMonth.getFullYear(),
            thisMonth.getMonth(),
            1,
          ).getTime();
          break;
        case "lastMonth":
          const lastMonth = new Date();
          lastMonth.setMonth(lastMonth.getMonth() - 1);
          startDate = new Date(
            lastMonth.getFullYear(),
            lastMonth.getMonth(),
            1,
          ).getTime();
          endDate = new Date(
            lastMonth.getFullYear(),
            lastMonth.getMonth() + 1,
            0,
          ).setHours(23, 59, 59, 999);
          break;
        case "thisYear":
          const thisYear = new Date();
          startDate = new Date(thisYear.getFullYear(), 0, 1).getTime();
          break;
        case "lastYear":
          const lastYear = new Date().getFullYear() - 1;
          startDate = new Date(lastYear, 0, 1).getTime();
          endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999).getTime();
          break;
      }
    }

    // Get orders for the vendor within the time range
    let vendorOrders;
    if (args.timeRange && args.timeRange !== "all") {
      vendorOrders = await ctx.db
        .query("orders")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
        .filter((q) =>
          q.and(
            q.gte(q.field("order_date"), startDate),
            q.lte(q.field("order_date"), endDate),
          ),
        )
        .collect();
    } else {
      vendorOrders = await ctx.db
        .query("orders")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
        .collect();
    }

    // Get order items for all vendor orders
    const orderIds = vendorOrders.map((order) => order._id);
    let orderItems: any[] = [];

    if (orderIds.length > 0) {
      orderItems = await ctx.db
        .query("order_items")
        .filter((q) =>
          q.or(
            ...orderIds.map((orderId) => q.eq(q.field("order_id"), orderId)),
          ),
        )
        .collect();
    }

    // Calculate metrics
    const totalOrders = vendorOrders.length;
    const totalAmount = vendorOrders.reduce(
      (sum, order) => sum + order.total_amount,
      0,
    );
    const totalSubtotal = vendorOrders.reduce(
      (sum, order) => sum + order.subtotal_amount,
      0,
    );

    // Calculate commission based on vendor settings
    let commissionEarned = 0;
    if (vendor.commission_type === "percentage") {
      commissionEarned = (totalSubtotal * vendor.commission) / 100;
    } else if (vendor.commission_type === "fixed") {
      commissionEarned = totalOrders * vendor.commission;
    }

    // Group orders by status
    const ordersByStatus = vendorOrders.reduce(
      (acc, order) => {
        acc[order.order_status] = (acc[order.order_status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Group orders by payment status
    const ordersByPaymentStatus = vendorOrders.reduce(
      (acc, order) => {
        acc[order.payment_status] = (acc[order.payment_status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Calculate successful checkouts (confirmed + processing + delivered + pickup + delivery)
    const successfulStatuses = [
      "Confirmed",
      "Processing",
      "Pickup",
      "Delivery",
      "Delivered",
    ];
    const totalCheckouts = vendorOrders.filter((order) =>
      successfulStatuses.includes(order.order_status),
    ).length;

    // Get top products for this vendor
    const productSales = orderItems.reduce(
      (acc, item) => {
        const key = item.product_id.toString();
        if (!acc[key]) {
          acc[key] = {
            productId: item.product_id,
            name: item.name,
            quantity: 0,
            revenue: 0,
            orders: 0,
          };
        }
        acc[key].quantity += item.quantity;
        acc[key].revenue += item.total;
        acc[key].orders += 1;
        return acc;
      },
      {} as Record<string, any>,
    );

    const topProducts = Object.values(productSales)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, 5);

    // Group sales by date for trend analysis
    const salesByDate = vendorOrders.reduce(
      (acc, order) => {
        const date = new Date(order.order_date).toISOString().split("T")[0];
        if (!acc[date]) {
          acc[date] = {
            date,
            orders: 0,
            revenue: 0,
          };
        }
        acc[date].orders += 1;
        acc[date].revenue += order.total_amount;
        return acc;
      },
      {} as Record<string, any>,
    );

    const salesTrend = Object.values(salesByDate).sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return {
      vendor: {
        id: vendor._id,
        name: vendor.name,
        commission: vendor.commission,
        commissionType: vendor.commission_type,
        status: vendor.status,
        contact: vendor.contact,
      },
      summary: {
        totalOrders,
        totalCheckouts,
        totalAmount,
        totalSubtotal,
        commissionEarned,
        avgOrderValue: totalOrders > 0 ? totalAmount / totalOrders : 0,
        conversionRate:
          totalOrders > 0 ? (totalCheckouts / totalOrders) * 100 : 0,
      },
      breakdown: {
        ordersByStatus,
        ordersByPaymentStatus,
        topProducts,
        salesTrend,
      },
      timeRange: {
        startDate,
        endDate,
        range: args.timeRange || "all",
      },
    };
  },
});

// Get growth rate compared to previous period
export const getGrowthRate = query({
  args: {
    metric: v.union(v.literal("revenue"), v.literal("orders")),
    currentPeriod: TimeRange,
    comparisonPeriod: TimeRange,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Helper function to get date range for a period
    const getDateRange = (period: string) => {
      let startDate = 0;
      let endDate = now;

      switch (period) {
        case "today":
          startDate = new Date().setHours(0, 0, 0, 0);
          break;
        case "yesterday":
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = new Date(yesterday.setHours(0, 0, 0, 0)).getTime();
          endDate = new Date(yesterday.setHours(23, 59, 59, 999)).getTime();
          break;
        case "thisWeek":
          const thisWeek = new Date();
          startDate = new Date(
            thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay()),
          ).setHours(0, 0, 0, 0);
          break;
        case "lastWeek":
          const lastWeek = new Date();
          const startOfLastWeek = new Date(lastWeek);
          startOfLastWeek.setDate(lastWeek.getDate() - lastWeek.getDay() - 7);
          startDate = startOfLastWeek.setHours(0, 0, 0, 0);
          const endOfLastWeek = new Date(startOfLastWeek);
          endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
          endDate = endOfLastWeek.setHours(23, 59, 59, 999);
          break;
        case "thisMonth":
          const thisMonth = new Date();
          startDate = new Date(
            thisMonth.getFullYear(),
            thisMonth.getMonth(),
            1,
          ).getTime();
          break;
        case "lastMonth":
          const lastMonth = new Date();
          lastMonth.setMonth(lastMonth.getMonth() - 1);
          startDate = new Date(
            lastMonth.getFullYear(),
            lastMonth.getMonth(),
            1,
          ).getTime();
          endDate = new Date(
            lastMonth.getFullYear(),
            lastMonth.getMonth() + 1,
            0,
          ).setHours(23, 59, 59, 999);
          break;
        case "thisYear":
          const thisYear = new Date();
          startDate = new Date(thisYear.getFullYear(), 0, 1).getTime();
          break;
        case "lastYear":
          const lastYear = new Date().getFullYear() - 1;
          startDate = new Date(lastYear, 0, 1).getTime();
          endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999).getTime();
          break;
        default:
          return { startDate: 0, endDate: now };
      }

      return { startDate, endDate };
    };

    // Get date ranges for both periods
    const currentRange = getDateRange(args.currentPeriod);
    const comparisonRange = getDateRange(args.comparisonPeriod);

    // Get orders for current period
    const currentOrders = await ctx.db
      .query("orders")
      .withIndex("by_order_date", (q) =>
        q
          .gte("order_date", currentRange.startDate)
          .lte("order_date", currentRange.endDate),
      )
      .collect();

    // Get orders for comparison period
    const comparisonOrders = await ctx.db
      .query("orders")
      .withIndex("by_order_date", (q) =>
        q
          .gte("order_date", comparisonRange.startDate)
          .lte("order_date", comparisonRange.endDate),
      )
      .collect();

    // Calculate metrics based on the requested metric type
    let currentValue = 0;
    let comparisonValue = 0;

    if (args.metric === "revenue") {
      currentValue = currentOrders.reduce(
        (sum, order) => sum + order.total_amount,
        0,
      );
      comparisonValue = comparisonOrders.reduce(
        (sum, order) => sum + order.total_amount,
        0,
      );
    } else if (args.metric === "orders") {
      currentValue = currentOrders.length;
      comparisonValue = comparisonOrders.length;
    }

    // Calculate growth rate
    let growthRate = 0;
    if (comparisonValue > 0) {
      growthRate = ((currentValue - comparisonValue) / comparisonValue) * 100;
    } else if (currentValue > 0) {
      growthRate = 100; // If there was no previous value but current has value, it's 100% growth
    }

    return {
      currentValue,
      comparisonValue,
      growthRate,
      currentPeriod: args.currentPeriod,
      comparisonPeriod: args.comparisonPeriod,
      metric: args.metric,
    };
  },
});

// Get comprehensive growth metrics
export const getGrowthMetrics = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get current month date range
    const thisMonth = new Date();
    const currentMonthStart = new Date(
      thisMonth.getFullYear(),
      thisMonth.getMonth(),
      1,
    ).getTime();

    // Get last month date range
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStart = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth(),
      1,
    ).getTime();
    const lastMonthEnd = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth() + 1,
      0,
    ).setHours(23, 59, 59, 999);

    // Get orders for current month
    const currentMonthOrders = await ctx.db
      .query("orders")
      .withIndex("by_order_date", (q) =>
        q.gte("order_date", currentMonthStart).lte("order_date", now),
      )
      .collect();

    // Get orders for last month
    const lastMonthOrders = await ctx.db
      .query("orders")
      .withIndex("by_order_date", (q) =>
        q.gte("order_date", lastMonthStart).lte("order_date", lastMonthEnd),
      )
      .collect();

    // Calculate revenue growth
    const currentRevenue = currentMonthOrders.reduce(
      (sum, order) => sum + order.total_amount,
      0,
    );
    const lastRevenue = lastMonthOrders.reduce(
      (sum, order) => sum + order.total_amount,
      0,
    );

    const revenueGrowthRate =
      lastRevenue > 0
        ? ((currentRevenue - lastRevenue) / lastRevenue) * 100
        : currentRevenue > 0
          ? 100
          : 0;

    // Calculate orders growth
    const currentOrderCount = currentMonthOrders.length;
    const lastOrderCount = lastMonthOrders.length;

    const ordersGrowthRate =
      lastOrderCount > 0
        ? ((currentOrderCount - lastOrderCount) / lastOrderCount) * 100
        : currentOrderCount > 0
          ? 100
          : 0;

    // Calculate average order value growth
    const currentAOV =
      currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;
    const lastAOV = lastOrderCount > 0 ? lastRevenue / lastOrderCount : 0;

    const aovGrowthRate =
      lastAOV > 0
        ? ((currentAOV - lastAOV) / lastAOV) * 100
        : currentAOV > 0
          ? 100
          : 0;

    return {
      revenue: {
        current: currentRevenue,
        previous: lastRevenue,
        growthRate: revenueGrowthRate,
      },
      orders: {
        current: currentOrderCount,
        previous: lastOrderCount,
        growthRate: ordersGrowthRate,
      },
      averageOrderValue: {
        current: currentAOV,
        previous: lastAOV,
        growthRate: aovGrowthRate,
      },
    };
  },
});

// Get revenue by category
export const getRevenueByCategory = query({
  args: {
    timeRange: v.optional(TimeRange),
  },
  handler: async (ctx, args) => {
    const orderItems = await ctx.db.query("order_items").collect();
    const products = await ctx.db.query("products").collect();
    const categories = await ctx.db.query("categories").collect();
    const orders = await ctx.db.query("orders").collect();

    // Create maps for quick lookups
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const categoryMap = new Map(categories.map((c) => [c._id.toString(), c]));
    const orderDateMap = new Map(
      orders.map((o) => [o._id.toString(), o.order_date]),
    );

    // Filter order items by time range if specified
    const filteredItems = args.timeRange
      ? orderItems.filter((item) => {
          const orderDate = orderDateMap.get(item.order_id.toString());
          if (!orderDate) return false;

          const now = Date.now();
          let startDate = 0;

          // Simplified time range check (same logic as in getSalesAnalytics)
          switch (args.timeRange) {
            case "today":
              startDate = new Date().setHours(0, 0, 0, 0);
              break;
            case "thisWeek":
              const thisWeek = new Date();
              startDate = new Date(
                thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay()),
              ).setHours(0, 0, 0, 0);
              break;
            case "thisMonth":
              const thisMonth = new Date();
              startDate = new Date(
                thisMonth.getFullYear(),
                thisMonth.getMonth(),
                1,
              ).getTime();
              break;
            case "thisYear":
              const thisYear = new Date();
              startDate = new Date(thisYear.getFullYear(), 0, 1).getTime();
              break;
            default:
              return true; // Include all items for other time ranges
          }

          return orderDate >= startDate && orderDate <= now;
        })
      : orderItems;

    // Calculate revenue by category
    const revenueByCategory = filteredItems.reduce(
      (acc, item) => {
        const product = productMap.get(item.product_id.toString());
        if (!product || !product.category_id) return acc;

        const category = categoryMap.get(product.category_id.toString());
        if (!category) return acc;

        const categoryName = category.name;

        if (!acc[categoryName]) {
          acc[categoryName] = 0;
        }

        acc[categoryName] += item.total;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Convert to array for the frontend
    return Object.entries(revenueByCategory).map(([category, revenue]) => ({
      category,
      revenue,
    }));
  },
});

// Get total Blink revenue from commissions
export const getTotalBlinkRevenue = query({
  args: {
    timeRange: v.optional(TimeRange),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let startDate = 0;
    let endDate = now;

    // Apply time range filtering (same logic as other queries)
    switch (args.timeRange) {
      case "today":
        startDate = new Date().setHours(0, 0, 0, 0);
        break;
      case "yesterday":
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.setHours(0, 0, 0, 0)).getTime();
        endDate = new Date(yesterday.setHours(23, 59, 59, 999)).getTime();
        break;
      case "thisWeek":
        const thisWeek = new Date();
        startDate = new Date(
          thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay()),
        ).setHours(0, 0, 0, 0);
        break;
      case "lastWeek":
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        startDate = new Date(
          lastWeek.setDate(lastWeek.getDate() - lastWeek.getDay()),
        ).setHours(0, 0, 0, 0);
        endDate = new Date(lastWeek.setDate(lastWeek.getDate() + 6)).setHours(
          23,
          59,
          59,
          999,
        );
        break;
      case "thisMonth":
        const thisMonth = new Date();
        startDate = new Date(
          thisMonth.getFullYear(),
          thisMonth.getMonth(),
          1,
        ).getTime();
        break;
      case "lastMonth":
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        startDate = new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth(),
          1,
        ).getTime();
        endDate = new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth() + 1,
          0,
        ).setHours(23, 59, 59, 999);
        break;
      case "thisYear":
        const thisYear = new Date();
        startDate = new Date(thisYear.getFullYear(), 0, 1).getTime();
        break;
      case "lastYear":
        const lastYear = new Date().getFullYear() - 1;
        startDate = new Date(lastYear, 0, 1).getTime();
        endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999).getTime();
        break;
    }

    let orders;

    // Get orders based on time range
    if (args.timeRange && args.timeRange !== "all") {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_order_date", (q) =>
          q.gte("order_date", startDate).lte("order_date", endDate),
        )
        .filter((q) => q.eq(q.field("order_status"), "Delivered"))
        .collect();
    } else {
      orders = await ctx.db
        .query("orders")
        .filter((q) => q.eq(q.field("order_status"), "Delivered"))
        .collect();
    }

    // Get all vendors to get commission data
    const vendors = await ctx.db.query("vendors").collect();
    const vendorMap = new Map(vendors.map((v) => [v._id.toString(), v]));

    let totalBlinkRevenue = 0;

    // Calculate commission for each delivered order
    for (const order of orders) {
      const vendor = vendorMap.get(order.vendor_id.toString());
      if (!vendor) continue;

      let commissionAmount = 0;

      if (vendor.commission_type === "percentage") {
        // Calculate percentage commission on order total
        commissionAmount = (order.total_amount * vendor.commission) / 100;
      } else if (vendor.commission_type === "fixed") {
        // Fixed commission amount per order
        commissionAmount = vendor.commission;
      }

      totalBlinkRevenue += commissionAmount;
    }

    return {
      totalRevenue: totalBlinkRevenue,
      orderCount: orders.length,
      averageCommissionPerOrder:
        orders.length > 0 ? totalBlinkRevenue / orders.length : 0,
    };
  },
});

// ── Helper: compute date range from TimeRange value ────────────
function computeDateRange(timeRange?: string): {
  startDate: number;
  endDate: number;
} {
  const now = Date.now();
  let startDate = 0;
  let endDate = now;

  switch (timeRange) {
    case "today":
      startDate = new Date().setHours(0, 0, 0, 0);
      break;
    case "yesterday": {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      startDate = new Date(d.setHours(0, 0, 0, 0)).getTime();
      endDate = new Date(d.setHours(23, 59, 59, 999)).getTime();
      break;
    }
    case "thisWeek": {
      const d = new Date();
      startDate = new Date(d.setDate(d.getDate() - d.getDay())).setHours(
        0,
        0,
        0,
        0,
      );
      break;
    }
    case "lastWeek": {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startDate = new Date(d.setDate(d.getDate() - d.getDay())).setHours(
        0,
        0,
        0,
        0,
      );
      endDate = new Date(d.setDate(d.getDate() + 6)).setHours(23, 59, 59, 999);
      break;
    }
    case "thisMonth": {
      const d = new Date();
      startDate = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      break;
    }
    case "lastMonth": {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      startDate = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0).setHours(
        23,
        59,
        59,
        999,
      );
      break;
    }
    case "thisYear": {
      startDate = new Date(new Date().getFullYear(), 0, 1).getTime();
      break;
    }
    case "lastYear": {
      const y = new Date().getFullYear() - 1;
      startDate = new Date(y, 0, 1).getTime();
      endDate = new Date(y, 11, 31, 23, 59, 59, 999).getTime();
      break;
    }
  }
  return { startDate, endDate };
}

// ── Orders summary by industry, vendor, category ───────────────
export const getOrdersSummary = query({
  args: {
    timeRange: v.optional(TimeRange),
    vendorIds: v.optional(v.array(v.id("vendors"))),
  },
  handler: async (ctx, args) => {
    const { startDate, endDate } = computeDateRange(args.timeRange);

    let orders;
    if (args.timeRange && args.timeRange !== "all") {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_order_date", (q) =>
          q.gte("order_date", startDate).lte("order_date", endDate),
        )
        .collect();
    } else {
      orders = await ctx.db.query("orders").collect();
    }

    // Apply vendor restriction
    if (args.vendorIds && args.vendorIds.length > 0) {
      const vSet = new Set(args.vendorIds.map((id) => id.toString()));
      orders = orders.filter((o) => vSet.has(o.vendor_id.toString()));
    }

    // Fetch lookup data
    const vendors = await ctx.db.query("vendors").collect();
    const industries = await ctx.db.query("industry").collect();
    const orderItems = await ctx.db.query("order_items").collect();
    const products = await ctx.db.query("products").collect();
    const categories = await ctx.db.query("categories").collect();

    const vendorMap = new Map(vendors.map((v) => [v._id.toString(), v]));
    const industryMap = new Map(industries.map((i) => [i._id.toString(), i]));
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const categoryMap = new Map(categories.map((c) => [c._id.toString(), c]));

    const orderIdSet = new Set(orders.map((o) => o._id.toString()));

    // --- By vendor ---
    const byVendor: Record<
      string,
      { name: string; orders: number; revenue: number }
    > = {};
    for (const order of orders) {
      const vid = order.vendor_id.toString();
      const vendor = vendorMap.get(vid);
      if (!byVendor[vid]) {
        byVendor[vid] = {
          name: vendor?.name ?? "Unknown",
          orders: 0,
          revenue: 0,
        };
      }
      byVendor[vid].orders++;
      byVendor[vid].revenue += order.total_amount;
    }

    // --- By industry ---
    const byIndustry: Record<
      string,
      { name: string; orders: number; revenue: number }
    > = {};
    for (const order of orders) {
      const vendor = vendorMap.get(order.vendor_id.toString());
      const indId = vendor?.industry_id?.toString() ?? "unknown";
      const industry = indId !== "unknown" ? industryMap.get(indId) : null;
      if (!byIndustry[indId]) {
        byIndustry[indId] = {
          name: industry?.name ?? "Uncategorized",
          orders: 0,
          revenue: 0,
        };
      }
      byIndustry[indId].orders++;
      byIndustry[indId].revenue += order.total_amount;
    }

    // --- By category (through order items → product → category) ---
    const byCategory: Record<
      string,
      { name: string; orders: number; revenue: number }
    > = {};
    const filteredItems = orderItems.filter((item) =>
      orderIdSet.has(item.order_id.toString()),
    );
    for (const item of filteredItems) {
      const product = productMap.get(item.product_id.toString());
      const catId = product?.category_id?.toString() ?? "unknown";
      const category = catId !== "unknown" ? categoryMap.get(catId) : null;
      if (!byCategory[catId]) {
        byCategory[catId] = {
          name: category?.name ?? "Uncategorized",
          orders: 0,
          revenue: 0,
        };
      }
      byCategory[catId].orders++;
      byCategory[catId].revenue += item.total;
    }

    return {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((s, o) => s + o.total_amount, 0),
      byVendor: Object.values(byVendor).sort((a, b) => b.revenue - a.revenue),
      byIndustry: Object.values(byIndustry).sort(
        (a, b) => b.revenue - a.revenue,
      ),
      byCategory: Object.values(byCategory).sort(
        (a, b) => b.revenue - a.revenue,
      ),
    };
  },
});

// ── Detailed orders insights ───────────────────────────────────
export const getDetailedOrdersInsights = query({
  args: {
    timeRange: v.optional(TimeRange),
    vendorIds: v.optional(v.array(v.id("vendors"))),
    industryId: v.optional(v.id("industry")),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const { startDate, endDate } = computeDateRange(args.timeRange);

    let orders;
    if (args.timeRange && args.timeRange !== "all") {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_order_date", (q) =>
          q.gte("order_date", startDate).lte("order_date", endDate),
        )
        .collect();
    } else {
      orders = await ctx.db.query("orders").collect();
    }

    // Vendor restriction
    if (args.vendorIds && args.vendorIds.length > 0) {
      const vSet = new Set(args.vendorIds.map((id) => id.toString()));
      orders = orders.filter((o) => vSet.has(o.vendor_id.toString()));
    }

    // Industry filter
    if (args.industryId) {
      const vendors = await ctx.db.query("vendors").collect();
      const indVendorIds = new Set(
        vendors
          .filter(
            (v) => v.industry_id?.toString() === args.industryId!.toString(),
          )
          .map((v) => v._id.toString()),
      );
      orders = orders.filter((o) => indVendorIds.has(o.vendor_id.toString()));
    }

    // Status distribution
    const statusDist: Record<string, number> = {};
    const paymentDist: Record<string, number> = {};
    const dailyTrend: Record<
      string,
      { date: string; orders: number; revenue: number }
    > = {};
    let totalRevenue = 0;

    for (const order of orders) {
      statusDist[order.order_status] =
        (statusDist[order.order_status] || 0) + 1;
      paymentDist[order.payment_status] =
        (paymentDist[order.payment_status] || 0) + 1;
      totalRevenue += order.total_amount;

      const date = new Date(order.order_date).toISOString().split("T")[0];
      if (!dailyTrend[date]) dailyTrend[date] = { date, orders: 0, revenue: 0 };
      dailyTrend[date].orders++;
      dailyTrend[date].revenue += order.total_amount;
    }

    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const trend = Object.values(dailyTrend).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return {
      totalOrders: orders.length,
      totalRevenue,
      avgOrderValue,
      statusDistribution: statusDist,
      paymentDistribution: paymentDist,
      dailyTrend: trend,
    };
  },
});

// ── Detailed shipments insights ────────────────────────────────
export const getDetailedShipmentsInsights = query({
  args: {
    timeRange: v.optional(TimeRange),
    vendorIds: v.optional(v.array(v.id("vendors"))),
  },
  handler: async (ctx, args) => {
    const { startDate, endDate } = computeDateRange(args.timeRange);

    let shipments = await ctx.db.query("shipments").collect();

    // Time filter using _creationTime
    if (args.timeRange && args.timeRange !== "all") {
      shipments = shipments.filter(
        (s) => s._creationTime >= startDate && s._creationTime <= endDate,
      );
    }

    // Vendor restriction through orders
    if (args.vendorIds && args.vendorIds.length > 0) {
      const vSet = new Set(args.vendorIds.map((id) => id.toString()));
      const orders = await ctx.db.query("orders").collect();
      const orderVendorMap = new Map(
        orders.map((o) => [o._id.toString(), o.vendor_id.toString()]),
      );
      shipments = shipments.filter((s) => {
        const vid = orderVendorMap.get(s.order_id.toString());
        return vid && vSet.has(vid);
      });
    }

    // Status distribution
    const statusDist: Record<string, number> = {};
    let totalDelivered = 0;
    let totalFailed = 0;
    const deliveryTimes: number[] = [];

    for (const s of shipments) {
      statusDist[s.status] = (statusDist[s.status] || 0) + 1;
      if (s.status === "Delivered") {
        totalDelivered++;
        if (s.updated_at && s._creationTime) {
          deliveryTimes.push(s.updated_at - s._creationTime);
        }
      }
      if (s.status === "Failed Delivery") totalFailed++;
    }

    const avgDeliveryTime =
      deliveryTimes.length > 0
        ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length
        : 0;

    const successRate =
      shipments.length > 0 ? (totalDelivered / shipments.length) * 100 : 0;

    // Daily trend
    const dailyTrend: Record<
      string,
      { date: string; created: number; delivered: number }
    > = {};
    for (const s of shipments) {
      const date = new Date(s._creationTime).toISOString().split("T")[0];
      if (!dailyTrend[date])
        dailyTrend[date] = { date, created: 0, delivered: 0 };
      dailyTrend[date].created++;
      if (s.status === "Delivered") dailyTrend[date].delivered++;
    }

    return {
      totalShipments: shipments.length,
      totalDelivered,
      totalFailed,
      successRate,
      avgDeliveryTimeMs: avgDeliveryTime,
      statusDistribution: statusDist,
      dailyTrend: Object.values(dailyTrend).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    };
  },
});

// ── Detailed products insights ─────────────────────────────────
export const getDetailedProductsInsights = query({
  args: {
    timeRange: v.optional(TimeRange),
    vendorIds: v.optional(v.array(v.id("vendors"))),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    let products = await ctx.db.query("products").collect();

    // Vendor restriction
    if (args.vendorIds && args.vendorIds.length > 0) {
      const vSet = new Set(args.vendorIds.map((id) => id.toString()));
      products = products.filter(
        (p) => p.vendor_id && vSet.has(p.vendor_id.toString()),
      );
    }

    // Category filter
    if (args.categoryId) {
      products = products.filter(
        (p) => p.category_id?.toString() === args.categoryId!.toString(),
      );
    }

    const categories = await ctx.db.query("categories").collect();
    const categoryMap = new Map(categories.map((c) => [c._id.toString(), c]));

    // Collect order items for sales data
    const { startDate, endDate } = computeDateRange(args.timeRange);
    const orders = await ctx.db.query("orders").collect();
    const orderItems = await ctx.db.query("order_items").collect();

    let filteredOrders = orders;
    if (args.timeRange && args.timeRange !== "all") {
      filteredOrders = orders.filter(
        (o) => o.order_date >= startDate && o.order_date <= endDate,
      );
    }
    if (args.vendorIds && args.vendorIds.length > 0) {
      const vSet = new Set(args.vendorIds.map((id) => id.toString()));
      filteredOrders = filteredOrders.filter((o) =>
        vSet.has(o.vendor_id.toString()),
      );
    }

    const orderIdSet = new Set(filteredOrders.map((o) => o._id.toString()));
    const productIdSet = new Set(products.map((p) => p._id.toString()));
    const relevantItems = orderItems.filter(
      (item) =>
        orderIdSet.has(item.order_id.toString()) &&
        productIdSet.has(item.product_id.toString()),
    );

    // Status breakdown
    const statusDist: Record<string, number> = {};
    let totalInventory = 0;
    let totalInventoryValue = 0;
    let lowStockCount = 0;

    for (const p of products) {
      statusDist[p.status] = (statusDist[p.status] || 0) + 1;
      totalInventory += p.quantity ?? 0;
      totalInventoryValue += (p.price ?? 0) * (p.quantity ?? 0);
      if ((p.quantity ?? 0) < 10) lowStockCount++;
    }

    // By category
    const byCategory: Record<
      string,
      { name: string; count: number; revenue: number }
    > = {};
    for (const p of products) {
      const catId = p.category_id?.toString() ?? "unknown";
      const cat = catId !== "unknown" ? categoryMap.get(catId) : null;
      if (!byCategory[catId]) {
        byCategory[catId] = {
          name: cat?.name ?? "Uncategorized",
          count: 0,
          revenue: 0,
        };
      }
      byCategory[catId].count++;
    }

    // Revenue by product
    const productRevenue: Record<
      string,
      { name: string; quantity: number; revenue: number }
    > = {};
    for (const item of relevantItems) {
      const pid = item.product_id.toString();
      if (!productRevenue[pid]) {
        productRevenue[pid] = { name: item.name, quantity: 0, revenue: 0 };
      }
      productRevenue[pid].quantity += item.quantity;
      productRevenue[pid].revenue += item.total;

      // Add revenue to category
      const product = products.find((p) => p._id.toString() === pid);
      if (product) {
        const catId = product.category_id?.toString() ?? "unknown";
        if (byCategory[catId]) {
          byCategory[catId].revenue += item.total;
        }
      }
    }

    const topProducts = Object.values(productRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalProducts: products.length,
      totalInventory,
      totalInventoryValue,
      lowStockCount,
      statusDistribution: statusDist,
      byCategory: Object.values(byCategory).sort(
        (a, b) => b.revenue - a.revenue,
      ),
      topProducts,
    };
  },
});

// ── Detailed users insights ────────────────────────────────────
export const getDetailedUsersInsights = query({
  args: {
    timeRange: v.optional(TimeRange),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const roles = await ctx.db.query("roles").collect();
    const orders = await ctx.db.query("orders").collect();

    const { startDate, endDate } = computeDateRange(args.timeRange);

    // Role distribution
    const roleMap = new Map(roles.map((r) => [r._id.toString(), r.name]));
    const byRole: Record<string, number> = {};
    for (const u of users) {
      const roleName = u.role_id
        ? (roleMap.get(u.role_id.toString()) ?? "No Role")
        : "No Role";
      byRole[roleName] = (byRole[roleName] || 0) + 1;
    }

    // Filter orders by time
    let filteredOrders = orders;
    if (args.timeRange && args.timeRange !== "all") {
      filteredOrders = orders.filter(
        (o) => o.order_date >= startDate && o.order_date <= endDate,
      );
    }

    // New users in time range
    let newUsers = users;
    if (args.timeRange && args.timeRange !== "all") {
      newUsers = users.filter(
        (u) => u._creationTime >= startDate && u._creationTime <= endDate,
      );
    }

    // Top customers by order count
    const customerOrders: Record<
      string,
      { name: string; email: string; orders: number; spent: number }
    > = {};
    for (const order of filteredOrders) {
      const uid = order.user_id.toString();
      if (!customerOrders[uid]) {
        const user = users.find((u) => u._id.toString() === uid);
        customerOrders[uid] = {
          name: user ? `${user.first_name} ${user.last_name}` : "Unknown",
          email: user?.email ?? "",
          orders: 0,
          spent: 0,
        };
      }
      customerOrders[uid].orders++;
      customerOrders[uid].spent += order.total_amount;
    }

    const topCustomers = Object.values(customerOrders)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10);

    // Daily signups
    const dailySignups: Record<string, number> = {};
    for (const u of newUsers) {
      const date = new Date(u._creationTime).toISOString().split("T")[0];
      dailySignups[date] = (dailySignups[date] || 0) + 1;
    }

    return {
      totalUsers: users.length,
      newUsersCount: newUsers.length,
      byRole,
      topCustomers,
      dailySignups: Object.entries(dailySignups)
        .map(([date, count]) => ({ date, count }))
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
    };
  },
});

// ── Detailed industries insights ───────────────────────────────
export const getDetailedIndustriesInsights = query({
  args: {
    timeRange: v.optional(TimeRange),
  },
  handler: async (ctx, args) => {
    const industries = await ctx.db.query("industry").collect();
    const vendors = await ctx.db.query("vendors").collect();
    const orders = await ctx.db.query("orders").collect();
    const products = await ctx.db.query("products").collect();

    const { startDate, endDate } = computeDateRange(args.timeRange);

    let filteredOrders = orders;
    if (args.timeRange && args.timeRange !== "all") {
      filteredOrders = orders.filter(
        (o) => o.order_date >= startDate && o.order_date <= endDate,
      );
    }

    // Use full vendor map (same pattern as getOrdersSummary)
    const vendorMap = new Map(vendors.map((v) => [v._id.toString(), v]));
    const industryMap = new Map(industries.map((i) => [i._id.toString(), i]));

    // By industry stats
    const industryStats: Record<
      string,
      {
        name: string;
        vendors: number;
        products: number;
        orders: number;
        revenue: number;
        status: string;
      }
    > = {};

    for (const ind of industries) {
      industryStats[ind._id.toString()] = {
        name: ind.name,
        vendors: 0,
        products: 0,
        orders: 0,
        revenue: 0,
        status: ind.status,
      };
    }

    // Count vendors per industry
    for (const v of vendors) {
      const indId = v.industry_id?.toString();
      if (indId && industryStats[indId]) {
        industryStats[indId].vendors++;
      }
    }

    // Count products per industry (via vendor → industry)
    for (const p of products) {
      if (!p.vendor_id) continue;
      const vendor = vendorMap.get(p.vendor_id.toString());
      const indId = vendor?.industry_id?.toString();
      if (indId && industryStats[indId]) {
        industryStats[indId].products++;
      }
    }

    // Count orders and revenue per industry (via vendor → industry)
    // Only count revenue from Paid orders
    let totalRevenue = 0;
    for (const o of filteredOrders) {
      const vendor = vendorMap.get(o.vendor_id.toString());
      const indId = vendor?.industry_id?.toString();
      const isPaid = o.payment_status === "Paid";

      if (indId && industryStats[indId]) {
        industryStats[indId].orders++;
        if (isPaid) {
          industryStats[indId].revenue += o.total_amount ?? 0;
        }
      }

      if (isPaid) {
        totalRevenue += o.total_amount ?? 0;
      }
    }

    return {
      totalIndustries: industries.length,
      activeIndustries: industries.filter((i) => i.status === "Active").length,
      totalRevenue,
      industries: Object.values(industryStats).sort(
        (a, b) => b.revenue - a.revenue,
      ),
    };
  },
});
