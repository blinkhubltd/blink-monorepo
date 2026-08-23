import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Seed sample notifications for testing
 * This function can be called from the Convex dashboard or a test script
 */
export const seedSampleNotifications = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the user by clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    const oneHour = 1000 * 60 * 60;
    const oneDay = oneHour * 24;

    // Sample notifications
    const sampleNotifications = [
      {
        user_id: user._id,
        type: "order_update" as const,
        status: "unread" as const,
        title: "Order Confirmed",
        message:
          "Your order #BL2024001 has been confirmed and is being prepared.",
        data: {
          orderId: "order_123",
          orderReference: "BL2024001",
          orderStatus: "confirmed",
          route: "/order-details/BL2024001",
        },
        created_at: now - 30 * 60 * 1000, // 30 minutes ago
        updated_at: now - 30 * 60 * 1000,
      },
      {
        user_id: user._id,
        type: "delivery" as const,
        status: "unread" as const,
        title: "Out for Delivery",
        message:
          "Your order #BL2024002 is out for delivery. Expected arrival: 2:30 PM",
        data: {
          orderId: "order_124",
          orderReference: "BL2024002",
          deliveryStatus: "out_for_delivery",
          estimatedTime: "2:30 PM",
          route: "/shipments",
        },
        created_at: now - 2 * oneHour, // 2 hours ago
        updated_at: now - 2 * oneHour,
      },
      {
        user_id: user._id,
        type: "promotion" as const,
        status: "unread" as const,
        title: "Special Offer! 🎉",
        message:
          "Get 20% off on your next grocery order. Use code FRESH20. Valid until tomorrow!",
        data: {
          promoCode: "FRESH20",
          discount: "20%",
          validUntil: "Tomorrow",
          route: "/tabs/(tabs)/home",
        },
        created_at: now - 6 * oneHour, // 6 hours ago
        updated_at: now - 6 * oneHour,
      },
      {
        user_id: user._id,
        type: "order_update" as const,
        status: "read" as const,
        title: "Order Delivered",
        message:
          "Your order #BL2024003 has been successfully delivered. Thank you for shopping with us!",
        data: {
          orderId: "order_125",
          orderReference: "BL2024003",
          orderStatus: "delivered",
          route: "/order-details/BL2024003",
        },
        read_at: now - 23 * oneHour, // Read 23 hours ago
        created_at: now - oneDay, // 1 day ago
        updated_at: now - 23 * oneHour,
      },
      {
        user_id: user._id,
        type: "system" as const,
        status: "read" as const,
        title: "Welcome to Blink! 👋",
        message:
          "Thanks for joining Blink! Enjoy fast grocery delivery right to your doorstep.",
        data: {
          route: "/tabs/(tabs)/home",
        },
        read_at: now - 25 * oneHour, // Read 25 hours ago
        created_at: now - 2 * oneDay, // 2 days ago
        updated_at: now - 25 * oneHour,
      },
      {
        user_id: user._id,
        type: "delivery" as const,
        status: "read" as const,
        title: "Delivery Completed",
        message:
          "Your order #BL2024004 has been delivered to your address. We hope you enjoy your items!",
        data: {
          orderId: "order_126",
          orderReference: "BL2024004",
          deliveryStatus: "delivered",
          route: "/order-details/BL2024004",
        },
        read_at: now - 47 * oneHour, // Read 47 hours ago
        created_at: now - 2 * oneDay, // 2 days ago
        updated_at: now - 47 * oneHour,
      },
    ];

    // Insert all notifications
    const insertedNotifications = [];
    for (const notification of sampleNotifications) {
      const id = await ctx.db.insert("notifications", notification);
      insertedNotifications.push(id);
    }

    return {
      success: true,
      message: `Successfully created ${insertedNotifications.length} sample notifications for user ${user.first_name} ${user.last_name}`,
      notificationIds: insertedNotifications,
      userId: user._id,
    };
  },
});

/**
 * Clear all notifications for a user (useful for testing)
 */
export const clearUserNotifications = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the user by clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get all notifications for this user
    const userNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .collect();

    // Delete all notifications
    for (const notification of userNotifications) {
      await ctx.db.delete(notification._id);
    }

    return {
      success: true,
      message: `Successfully deleted ${userNotifications.length} notifications for user ${user.first_name} ${user.last_name}`,
      deletedCount: userNotifications.length,
      userId: user._id,
    };
  },
});

/**
 * Create a sample notification for testing (can be called from frontend)
 */
export const createSampleNotification = mutation({
  args: {
    clerkId: v.string(),
    type: v.optional(
      v.union(
        v.literal("order_update"),
        v.literal("delivery"),
        v.literal("promotion"),
        v.literal("system")
      )
    ),
  },
  handler: async (ctx, args) => {
    // Get the user by clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    const type = args.type || "system";

    let notification;
    switch (type) {
      case "order_update":
        notification = {
          user_id: user._id,
          type: "order_update" as const,
          status: "unread" as const,
          title: "Order Status Update",
          message: `Your order #BL${Date.now().toString().slice(-6)} status has been updated.`,
          data: {
            orderReference: `BL${Date.now().toString().slice(-6)}`,
            route: "/tabs/(tabs)/orders",
          },
          created_at: now,
          updated_at: now,
        };
        break;

      case "delivery":
        notification = {
          user_id: user._id,
          type: "delivery" as const,
          status: "unread" as const,
          title: "Delivery Update",
          message: "Your order is on the way! Expected delivery in 30 minutes.",
          data: {
            route: "/shipments",
          },
          created_at: now,
          updated_at: now,
        };
        break;

      case "promotion":
        notification = {
          user_id: user._id,
          type: "promotion" as const,
          status: "unread" as const,
          title: "Limited Time Offer! 🔥",
          message:
            "Flash sale! Get 15% off all fresh produce. Limited time only!",
          data: {
            promoCode: "FLASH15",
            route: "/tabs/(tabs)/home",
          },
          created_at: now,
          updated_at: now,
        };
        break;

      default: // system
        notification = {
          user_id: user._id,
          type: "system" as const,
          status: "unread" as const,
          title: "System Notification",
          message: "This is a test notification created from the app.",
          data: {
            route: "/notifications",
          },
          created_at: now,
          updated_at: now,
        };
        break;
    }

    const notificationId = await ctx.db.insert("notifications", notification);

    return {
      success: true,
      message: `Created ${type} notification`,
      notificationId,
      notification: { ...notification, _id: notificationId },
    };
  },
});
