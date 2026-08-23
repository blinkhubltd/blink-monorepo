import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import { hasRoleName, isPicker, isRider, SYSTEM_ROLES } from "./lib/roles";

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const getPickerOrders = query({
  args: {
    pickerId: v.id("users"),
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
  },
  handler: async (ctx, args) => {
    // Get picker details
    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      return [];
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId) {
      return [];
    }

    // Get orders for this vendor
    let ordersQuery = ctx.db
      .query("orders")
      .withIndex("by_vendor", (q) => q.eq("vendor_id", vendorId));

    const orders = await ordersQuery.collect();

    // Filter by status if provided
    const filteredOrders = args.status
      ? orders.filter((order) => order.order_status === args.status)
      : orders;

    // Filter for picker-relevant statuses
    // Pending & Confirmed: Orders that need to be picked
    // Processing: Orders currently being picked
    // Exclude Pickup onwards (Pickup, Delivery, Delivered) - picker's work is done
    const pickerRelevantOrders = filteredOrders.filter(
      (order) =>
        order.order_status === "Pending" ||
        order.order_status === "Confirmed" ||
        order.order_status === "Processing",
    );

    // Enrich with customer, vendor info, and order items
    const enrichedOrders = await Promise.all(
      pickerRelevantOrders.map(async (order) => {
        const customer = await ctx.db.get(order.user_id);
        const vendor = await ctx.db.get(order.vendor_id);

        // Fetch order items from order_items table
        const orderItems = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("order_id", order._id))
          .collect();

        return {
          ...order,
          customer_name: customer
            ? `${customer.first_name} ${customer.last_name}`
            : "Unknown",
          vendor_name: vendor?.name || "Unknown Vendor",
          due_time: new Date(order.order_date).toLocaleString(),
          items: orderItems,
        };
      }),
    );

    return enrichedOrders.sort((a, b) => a.order_date - b.order_date);
  },
});

// Get detailed order with items for picker
export const getPickerOrderDetails = query({
  args: {
    orderId: v.id("orders"),
    pickerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    // Verify picker has access to this order
    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      return null;
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId || order.vendor_id !== vendorId) {
      return null;
    }

    // Get all related data
    const [customer, vendor, orderItems, rider] = await Promise.all([
      ctx.db.get(order.user_id),
      ctx.db.get(order.vendor_id),
      ctx.db
        .query("order_items")
        .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
        .collect(),
      order.rider_id ? ctx.db.get(order.rider_id) : null,
    ]);

    // Get product details for each item
    const itemsWithProducts = await Promise.all(
      orderItems.map(async (item) => {
        const product = await ctx.db.get(item.product_id);
        return {
          ...item,
          product_name: product?.name || item.name,
          sku: product?.sku || item.sku,
          barcode: product?.barcode || "",
          aisle: product?.category_id ? "A1" : "General",
          unit_type: product?.unit_type,
          unit_value: product?.unit_value,
        };
      }),
    );

    return {
      ...order,
      customer: {
        name: customer
          ? `${customer.first_name} ${customer.last_name}`
          : "Unknown",
        phone: customer?.phone,
        email: customer?.email,
        address: customer?.address,
      },
      vendor: {
        name: vendor?.name || "Unknown",
        address: vendor?.address,
      },
      rider: rider
        ? {
            _id: rider._id,
            name: `${rider.first_name} ${rider.last_name}`,
            phone: rider.phone,
          }
        : null,
      items: itemsWithProducts,
      total_items: itemsWithProducts.length,
    };
  },
});

// Update order status for picker actions
export const updatePickerOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    pickerId: v.id("users"),
    status: v.union(
      v.literal("Processing"), // Start Picking
      v.literal("Pickup"), // Ready for Rider
    ),
  },
  handler: async (ctx, args) => {
    // Verify picker has access
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      throw new Error("Unauthorized: Not a picker");
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId || order.vendor_id !== vendorId) {
      throw new Error("Unauthorized: Order not assigned to your vendor");
    }

    // Validate status transitions
    if (args.status === "Processing" && order.order_status !== "Confirmed") {
      throw new ConvexError("Can only start picking confirmed orders");
    }

    if (args.status === "Pickup" && order.order_status !== "Processing") {
      throw new ConvexError("Must start picking before marking as ready");
    }

    // Update order status and assign picker
    await ctx.db.patch(args.orderId, {
      order_status: args.status,
      assigned_picker_id: args.pickerId, // Ensure picker is assigned
      updated_at: Date.now(),
      // Capture picked_up_at when picker marks order as ready (Pickup)
      ...(args.status === "Pickup" ? { picked_up_at: Date.now() } : {}),
    });

    // Log picker activity when order is marked as ready (Pickup status)
    if (args.status === "Pickup") {
      try {
        const orderItems = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
          .collect();

        await ctx.runMutation(api.incentives.logPickerActivity, {
          picker_id: args.pickerId,
          order_id: args.orderId,
          items_picked: orderItems.length,
        });
        console.log(
          `Logged picker activity for picker ${args.pickerId}, order ${args.orderId}, items: ${orderItems.length}`,
        );
      } catch (error) {
        console.error("Failed to log picker activity:", error);
        // Don't fail the order status update if activity logging fails
      }
    }

    // Trigger notifications for the status update
    try {
      await ctx.scheduler.runAfter(
        0,
        api.notifications.triggerOrderStatusNotification,
        {
          orderId: args.orderId,
          newStatus: args.status,
        },
      );
    } catch (error) {
      console.error("Failed to schedule status notification:", error);
      // Don't fail the status update if notification scheduling fails
    }

    return { success: true, newStatus: args.status };
  },
});

// Start picking an order
export const startPicking = mutation({
  args: {
    orderId: v.id("orders"),
    pickerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify picker has access
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      throw new Error("Unauthorized: Not a picker");
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId || order.vendor_id !== vendorId) {
      throw new Error("Unauthorized: Order not assigned to your vendor");
    }

    // Validate status transition
    if (order.order_status !== "Confirmed") {
      throw new ConvexError("Can only start picking confirmed orders");
    }

    await ctx.db.patch(args.orderId, {
      order_status: "Processing",
      assigned_picker_id: args.pickerId,
      updated_at: Date.now(),
      // Capture confirmed_at if not already set (order was in Confirmed state)
      ...(!order.confirmed_at ? { confirmed_at: Date.now() } : {}),
    });

    try {
      await ctx.scheduler.runAfter(
        0,
        api.notifications.triggerOrderStatusNotification,
        {
          orderId: args.orderId,
          newStatus: "Processing",
        },
      );
    } catch (error) {
      console.error("Failed to schedule status notification:", error);
    }

    return { success: true, newStatus: "Processing" };
  },
});

export const markReadyForPickup = mutation({
  args: {
    orderId: v.id("orders"),
    pickerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      throw new Error("Unauthorized: Not a picker");
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId || order.vendor_id !== vendorId) {
      throw new Error("Unauthorized: Order not assigned to your vendor");
    }

    if (
      order.order_status !== "Processing" &&
      order.order_status !== "Confirmed"
    ) {
      throw new ConvexError(
        "Order must be in the hands of the picker before marking as ready",
      );
    }

    await ctx.db.patch(args.orderId, {
      order_status: "Delivery",
      assigned_picker_id: args.pickerId,
      updated_at: Date.now(),
      picked_up_at: Date.now(),
    });

    try {
      const orderItems = await ctx.db
        .query("order_items")
        .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
        .collect();

      await ctx.runMutation(api.incentives.logPickerActivity, {
        picker_id: args.pickerId,
        order_id: args.orderId,
        items_picked: orderItems.length,
      });
      console.log(
        `Logged picker activity for picker ${args.pickerId}, order ${args.orderId}, items: ${orderItems.length}`,
      );
    } catch (error) {
      console.error("Failed to log picker activity:", error);
    }

    try {
      await ctx.runMutation(internal.dispatch.autoAssignRiderToOrderInternal, {
        orderId: args.orderId,
      });
    } catch (err) {
      console.error("autoAssignRiderToOrderInternal failed", err);
    }

    try {
      await ctx.scheduler.runAfter(
        0,
        api.notifications.triggerOrderStatusNotification,
        {
          orderId: args.orderId,
          newStatus: "Delivery",
        },
      );
    } catch (error) {
      console.error("Failed to schedule status notification:", error);
    }

    return { success: true, newStatus: "Pickup" };
  },
});

export const markItemPicked = mutation({
  args: {
    orderId: v.id("orders"),
    itemId: v.id("order_items"),
    pickerId: v.id("users"),
    isPicked: v.boolean(),
  },
  handler: async (ctx, args) => {
    console.log("markItemPicked called with:", args);

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      throw new Error("Unauthorized");
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId || order.vendor_id !== vendorId) {
      throw new Error("Unauthorized");
    }

    const item = await ctx.db.get(args.itemId);
    if (!item || item.order_id !== args.orderId) {
      throw new ConvexError("Item not found or doesn't belong to this order");
    }

    console.log("Item before update:", {
      id: item._id,
      is_picked: item.is_picked,
    });

    await ctx.db.patch(args.itemId, {
      is_picked: args.isPicked,
      picked_quantity: args.isPicked ? item.quantity : 0,
    });

    console.log("Item updated with is_picked:", args.isPicked);

    return { success: true, isPicked: args.isPicked };
  },
});

// Hand over order to rider
export const handOverToRider = mutation({
  args: {
    orderId: v.id("orders"),
    pickerId: v.id("users"),
    riderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // Verify picker
    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      throw new Error("Unauthorized: Not a picker");
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId || order.vendor_id !== vendorId) {
      throw new Error("Unauthorized: Order not assigned to your vendor");
    }

    // Verify order is ready for pickup
    if (order.order_status !== "Pickup") {
      throw new ConvexError("Order must be ready for pickup first");
    }

    // Verify rider
    const rider = await ctx.db.get(args.riderId);
    if (!rider || !(await hasRoleName(ctx, rider, "Rider"))) {
      throw new Error("Invalid rider");
    }

    // Update order with rider assignment
    await ctx.db.patch(args.orderId, {
      rider_id: args.riderId,
      order_status: "Delivery",
      updated_at: Date.now(),
    });

    // Create or update shipment
    const existingShipment = await ctx.db
      .query("shipments")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .first();

    if (existingShipment) {
      await ctx.db.patch(existingShipment._id, {
        rider_id: args.riderId,
        status: "Awaiting Pickup",
        updated_at: Date.now(),
      });
    } else {
      const vendor = await ctx.db.get(order.vendor_id);
      await ctx.db.insert("shipments", {
        order_id: args.orderId,
        vendor_id: order.vendor_id,
        rider_id: args.riderId,
        pickup_address: vendor?.address || {},
        delivery_address: order.address || {},
        status: "Awaiting Pickup",
        updated_at: Date.now(),
      });
    }

    return {
      success: true,
      message: `Order handed over to ${rider.first_name} ${rider.last_name}`,
    };
  },
});

// Get completed orders for a picker
export const getPickerCompletedOrders = query({
  args: {
    pickerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get picker details
    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      return [];
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId) {
      return [];
    }

    // Get orders for this vendor that are completed
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_vendor", (q) => q.eq("vendor_id", vendorId))
      .collect();

    // Filter for completed statuses
    // Pickup: Order ready for rider (picker's work is done)
    // Delivery: Order out for delivery (picker's work is done)
    // Delivered: Order completed (picker's work is done)
    // Cancelled: Order cancelled
    const completedOrders = orders.filter(
      (order) =>
        order.order_status === "Pickup" ||
        order.order_status === "Delivery" ||
        order.order_status === "Delivered" ||
        order.order_status === "Cancelled",
    );

    // Enrich with customer, vendor info, and order items
    const enrichedOrders = await Promise.all(
      completedOrders.map(async (order) => {
        const customer = await ctx.db.get(order.user_id);
        const vendor = await ctx.db.get(order.vendor_id);

        // Fetch order items from order_items table
        const orderItems = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("order_id", order._id))
          .collect();

        return {
          ...order,
          customer_name: customer
            ? `${customer.first_name} ${customer.last_name}`
            : "Unknown",
          vendor_name: vendor?.name || "Unknown Vendor",
          completed_time: order.updated_at || order.order_date,
          items: orderItems,
        };
      }),
    );

    return enrichedOrders.sort(
      (a, b) => (b.updated_at || b.order_date) - (a.updated_at || a.order_date),
    );
  },
});

// Get available riders for handover
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
          .withIndex("by_role_id", (q) => q.eq("role_id", riderRole._id))
          .collect()
      : [];

    const activeRiders = riders.filter(
      (rider) =>
        rider.rider_details?.status === "Active" ||
        rider.rider_details?.status === "On Delivery",
    );

    return activeRiders.map((rider) => ({
      _id: rider._id,
      name: `${rider.first_name} ${rider.last_name}`,
      phone: rider.phone,
      status: rider.rider_details?.status,
      vehicle_type: rider.rider_details?.vehicle_type,
    }));
  },
});

export const scanItem = mutation({
  args: {
    orderId: v.id("orders"),
    barcode: v.string(),
    pickerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const picker = await ctx.db.get(args.pickerId);
    if (!picker || !(await hasRoleName(ctx, picker, "Picker"))) {
      throw new Error("Unauthorized");
    }

    const vendorId = picker.picker_details?.vendor_id;
    if (!vendorId || order.vendor_id !== vendorId) {
      throw new Error("Unauthorized");
    }

    const product = await ctx.db
      .query("products")
      .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
      .first();

    // Fallback: try looking up by product ID if barcode lookup fails
    let matchedProduct = product;
    if (!matchedProduct) {
      try {
        const normalizedId = ctx.db.normalizeId("products", args.barcode);
        if (normalizedId) {
          const byId = await ctx.db.get(normalizedId);
          if (byId) {
            matchedProduct = byId;
          }
        }
      } catch {
        // Not a valid ID format — ignore
      }
    }

    if (!matchedProduct) {
      throw new ConvexError("Product not found with this barcode or ID");
    }

    const orderItem = await ctx.db
      .query("order_items")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .filter((q) => q.eq(q.field("product_id"), matchedProduct._id))
      .first();

    if (!orderItem) {
      throw new ConvexError("This product is not in the current order");
    }

    const currentPicked = orderItem.picked_quantity || 0;
    const newPicked = currentPicked + 1;

    if (newPicked > orderItem.quantity) {
      throw new ConvexError("Quantity exceeded for this item");
    }

    const isPicked = newPicked >= orderItem.quantity;

    await ctx.db.patch(orderItem._id, {
      picked_quantity: newPicked,
      is_picked: isPicked,
      barcodeVerified: true,
      barcodeVerifiedAt: Date.now(),
    });

    const updatedItems = await ctx.db
      .query("order_items")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .collect();

    const allPicked = updatedItems.every((item) => item.is_picked);

    if (allPicked) {
      await ctx.db.patch(args.orderId, {
        order_status: "Delivery",
        assigned_picker_id: args.pickerId,
        updated_at: Date.now(),
      });

      const existingActivity = await ctx.db
        .query("picker_activity")
        .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
        .first();

      if (!existingActivity) {
        const now = Date.now();
        const day_bucket = startOfDay(new Date(now));
        await ctx.db.insert("picker_activity", {
          picker_id: args.pickerId,
          order_id: args.orderId,
          items_picked: updatedItems.length,
          day_bucket,
          created_at: now,
        });
      }

      try {
        await ctx.runMutation(
          internal.dispatch.autoAssignRiderToOrderInternal,
          {
            orderId: args.orderId,
          },
        );
      } catch (err) {
        console.error("autoAssignRiderToOrderInternal failed", err);
      }

      /**
       * Notification to customer */
      try {
        await ctx.scheduler.runAfter(
          0,
          api.notifications.triggerOrderStatusNotification,
          {
            orderId: args.orderId,
            newStatus: "Delivery",
          },
        );
      } catch (error) {
        console.error("Failed to schedule status notification:", error);
      }
    }

    return {
      success: true,
      item: { ...orderItem, picked_quantity: newPicked, is_picked: isPicked },
      orderComplete: allPicked,
    };
  },
});
