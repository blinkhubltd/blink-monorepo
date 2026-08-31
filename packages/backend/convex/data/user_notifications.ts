import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import {
  notificationReadStatus,
  notificationTypes,
} from "../validators";
import { getAuthUser, getAuthUserOrNull } from "../auth.helpers";

// 90 days in milliseconds
const NOTIFICATION_RETENTION_PERIOD = 90 * 24 * 60 * 60 * 1000;

/** Past this the badge reads "9+", so counting further is wasted work. */
const UNREAD_BADGE_CAP = 9;

/** Ceiling on one mark-all pass. See the note on `markAllMyNotificationsRead`. */
const MAX_BULK_MARK = 200;

/**
 * `notifications.data` is `v.any()`, so its shape is whatever the writer chose.
 * These two readers narrow the only fields the customer app navigates by, and
 * return null for anything else rather than passing an untyped blob to a client.
 */
function readOrderId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as { orderId?: unknown }).orderId;
  return typeof value === "string" ? value : null;
}

function readRoute(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as { route?: unknown }).route;
  return typeof value === "string" ? value : null;
}

/**
 * Get all notifications for a user (excludes auto-deleted ones)
 */
/**
 * @internal Took `userId` as an argument and was public, so any caller could read any
 * user's feed — and delivery-code notifications carry the six-digit handover
 * code in their message and in `data.deliveryCode`. Use `getMyNotifications`.
 */
export const getUserNotifications = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    status: v.optional(v.union(...notificationReadStatus.map((e) => v.literal(e)))),
    type: v.optional(
      v.union(...notificationTypes.map((e) => v.literal(e)))
    ),
  },
  handler: async (ctx, args) => {
    const { userId, limit = 50, status, type } = args;

    let query = ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("user_id", userId))
      .order("desc");

    if (status) {
      query = ctx.db
        .query("notifications")
        .withIndex("by_user_status", (q) =>
          q.eq("user_id", userId).eq("status", status)
        )
        .order("desc");
    }

    let notifications = await query.take(limit);

    // Filter by type if specified
    if (type) {
      notifications = notifications.filter((n) => n.type === type);
    }

    // Filter out notifications older than 90 days (client-side filter for performance)
    const cutoffTime = Date.now() - NOTIFICATION_RETENTION_PERIOD;
    notifications = notifications.filter((n) => n.created_at > cutoffTime);

    return notifications;
  },
});

/**
 * Get unread notification count for a user (excludes old notifications)
 */
/**
 * @internal Took `userId` as an argument. Use `getMyUnreadCount`.
 */
export const getUnreadNotificationCount = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_status", (q) =>
        q.eq("user_id", args.userId).eq("status", "unread")
      )
      .collect();

    // Only count notifications within retention period
    const cutoffTime = Date.now() - NOTIFICATION_RETENTION_PERIOD;
    const validNotifications = notifications.filter(
      (n) => n.created_at > cutoffTime
    );

    return validNotifications.length;
  },
});

/**
 * Get notifications that are older than 90 days for cleanup
 */
export const getExpiredNotifications = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 100 } = args;
    const cutoffTime = Date.now() - NOTIFICATION_RETENTION_PERIOD;

    const expiredNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_created_at")
      .filter((q) => q.lt(q.field("created_at"), cutoffTime))
      .take(limit);

    return expiredNotifications;
  },
});

/**
 * Clean up notifications older than 90 days
 */
export const cleanupExpiredNotifications = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { batchSize = 50 } = args;
    const cutoffTime = Date.now() - NOTIFICATION_RETENTION_PERIOD;

    const expiredNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_created_at")
      .filter((q) => q.lt(q.field("created_at"), cutoffTime))
      .take(batchSize);

    const deletePromises = expiredNotifications.map((notification) =>
      ctx.db.delete(notification._id)
    );

    await Promise.all(deletePromises);

    return {
      deleted: expiredNotifications.length,
      cutoffTime,
      hasMore: expiredNotifications.length === batchSize,
    };
  },
});

/**
 * Scheduled action to automatically clean up expired notifications
 */
export const scheduleNotificationCleanup = internalAction({
  args: {},
  handler: async (ctx) => {
    let totalDeleted = 0;
    let hasMore = true;

    // Process in batches to avoid timeout
    while (hasMore && totalDeleted < 1000) {
      const result = await ctx.runMutation(
        internal.data.user_notifications.cleanupExpiredNotifications,
        { batchSize: 100 }
      );

      totalDeleted += result.deleted;
      hasMore = result.hasMore;

      if (result.deleted === 0) break;
    }

    console.log(
      `Notification cleanup completed: ${totalDeleted} notifications deleted`
    );
    return { totalDeleted };
  },
});

/**
 * Create a new notification with automatic expiry tracking
 */
/**
 * @internal Was a public mutation, so anyone could write into any
 * customer's notification feed. A notification titled "Your Delivery Code"
 * carrying an attacker's number is a phishing message delivered inside the
 * app the customer trusts. Reached through `internal.*` from the actions in
 * `notifications.ts`.
 */
export const createNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(...notificationTypes.map((e) => v.literal(e))),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const notificationId = await ctx.db.insert("notifications", {
      user_id: args.userId,
      type: args.type,
      status: "unread",
      title: args.title,
      message: args.message,
      data: args.data,
      created_at: now,
      updated_at: now,
    });

    return notificationId;
  },
});

/**
 * Create notification for rider assignment
 */
/**
 * @internal Was a public mutation, so anyone could write into any
 * customer's notification feed. A notification titled "Your Delivery Code"
 * carrying an attacker's number is a phishing message delivered inside the
 * app the customer trusts. Reached through `internal.*` from the actions in
 * `notifications.ts`.
 */
export const createRiderAssignmentNotification = internalMutation({
  args: {
    riderId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    customerName: v.string(),
    deliveryAddress: v.string(),
    shipmentId: v.optional(v.id("shipments")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const title = "🚚 New Delivery Assignment!";
    const message = `Order #${args.orderReference.slice(-6)} for ${args.customerName}\nDelivery to: ${args.deliveryAddress}`;

    return await ctx.db.insert("notifications", {
      user_id: args.riderId,
      type: "delivery",
      status: "unread",
      title,
      message,
      data: {
        type: "delivery_assigned",
        orderId: args.orderId,
        shipmentId: args.shipmentId,
        orderReference: args.orderReference,
        customerName: args.customerName,
        deliveryAddress: args.deliveryAddress,
        route: "/(tabs)/deliveries",
        priority: "high",
      },
      created_at: now,
      updated_at: now,
    });
  },
});

/**
 * Create notification for picker assignment
 */
/**
 * @internal Was a public mutation, so anyone could write into any
 * customer's notification feed. A notification titled "Your Delivery Code"
 * carrying an attacker's number is a phishing message delivered inside the
 * app the customer trusts. Reached through `internal.*` from the actions in
 * `notifications.ts`.
 */
export const createPickerAssignmentNotification = internalMutation({
  args: {
    pickerId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    customerName: v.string(),
    itemCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const title = "📋 New Order Assignment!";
    const message = `Order #${args.orderReference} for ${args.customerName}\n${args.itemCount} items to pick`;

    return await ctx.db.insert("notifications", {
      user_id: args.pickerId,
      type: "order_update",
      status: "unread",
      title,
      message,
      data: {
        type: "order_assigned",
        orderId: args.orderId,
        orderReference: args.orderReference,
        customerName: args.customerName,
        itemCount: args.itemCount,
        route: "/(picker-tabs)/orders",
        priority: "high",
      },
      created_at: now,
      updated_at: now,
    });
  },
});

/**
 * Create notification for vendor pickers about new order
 */
/**
 * @internal Was a public mutation, so anyone could write into any
 * customer's notification feed. A notification titled "Your Delivery Code"
 * carrying an attacker's number is a phishing message delivered inside the
 * app the customer trusts. Reached through `internal.*` from the actions in
 * `notifications.ts`.
 */
export const createVendorPickerNotification = internalMutation({
  args: {
    pickerId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    customerName: v.string(),
    itemCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const title = "📦 New Order Available!";
    const message = `Order #${args.orderReference} for ${args.customerName}\n${args.itemCount} items ready to pick`;

    return await ctx.db.insert("notifications", {
      user_id: args.pickerId,
      type: "order_update",
      status: "unread",
      title,
      message,
      data: {
        type: "order_assigned",
        orderId: args.orderId,
        orderReference: args.orderReference,
        customerName: args.customerName,
        itemCount: args.itemCount,
        route: "/(picker-tabs)/orders",
        priority: "normal",
      },
      created_at: now,
      updated_at: now,
    });
  },
});

/**
 * Create notification for rider when order is ready for pickup
 */
/**
 * @internal Was a public mutation, so anyone could write into any
 * customer's notification feed. A notification titled "Your Delivery Code"
 * carrying an attacker's number is a phishing message delivered inside the
 * app the customer trusts. Reached through `internal.*` from the actions in
 * `notifications.ts`.
 */
export const createOrderReadyNotification = internalMutation({
  args: {
    riderId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    pickupLocation: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const title = "📦 Order Ready for Pickup!";
    const message = `Order #${args.orderReference} is ready\nPickup from: ${args.pickupLocation}`;

    return await ctx.db.insert("notifications", {
      user_id: args.riderId,
      type: "delivery",
      status: "unread",
      title,
      message,
      data: {
        type: "order_ready",
        orderId: args.orderId,
        orderReference: args.orderReference,
        pickupLocation: args.pickupLocation,
        route: "/(tabs)/deliveries",
        priority: "high",
      },
      created_at: now,
      updated_at: now,
    });
  },
});

/**
 * Create delivery code notification for customers
 */
/**
 * @internal Was a public mutation, so anyone could write into any
 * customer's notification feed. A notification titled "Your Delivery Code"
 * carrying an attacker's number is a phishing message delivered inside the
 * app the customer trusts. Reached through `internal.*` from the actions in
 * `notifications.ts`.
 */
export const createDeliveryCodeNotification = internalMutation({
  args: {
    userId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    deliveryCode: v.string(),
    isResend: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const title = args.isResend
      ? "🔐 Delivery Code Resent"
      : "🔐 Your Delivery Code";
    const message = `Use code ${args.deliveryCode} to verify delivery for order ${args.orderReference.slice(-6).toUpperCase()}. Please keep it private.`;

    return await ctx.db.insert("notifications", {
      user_id: args.userId,
      type: "delivery",
      status: "unread",
      title,
      message,
      data: {
        type: "delivery_code",
        orderId: args.orderId,
        orderReference: args.orderReference,
        deliveryCode: args.deliveryCode,
        isResend: args.isResend || false,
        route: `/order-details/${args.orderId}`,
        priority: "high",
      },
      created_at: now,
      updated_at: now,
    });
  },
});

/**
 * Create order status update notification for customers
 */
/**
 * @internal Was a public mutation, so anyone could write into any
 * customer's notification feed. A notification titled "Your Delivery Code"
 * carrying an attacker's number is a phishing message delivered inside the
 * app the customer trusts. Reached through `internal.*` from the actions in
 * `notifications.ts`.
 */
export const createOrderStatusNotification = internalMutation({
  args: {
    userId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    newStatus: v.string(),
    previousStatus: v.optional(v.string()),
    estimatedDelivery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    let title = "📋 Order Update";
    let message = `Your order #${args.orderReference} is now ${args.newStatus}`;

    // Customize title and message based on status
    switch (args.newStatus) {
      case "Confirmed":
        title = "✅ Order Confirmed";
        message = `Great! Your order #${args.orderReference} has been confirmed and is being prepared.`;
        break;
      case "Processing":
        title = "👨‍🍳 Order Being Prepared";
        message = `Your order #${args.orderReference} is now being prepared by our team.`;
        break;
      case "Pickup":
        title = "📦 Ready for Pickup";
        message = `Your order #${args.orderReference} is ready and waiting for pickup by our rider.`;
        break;
      case "Delivery":
        title = "🚚 Out for Delivery";
        message = `Great news! Your order #${args.orderReference} is on its way to you.`;
        if (args.estimatedDelivery) {
          message += ` Estimated arrival: ${args.estimatedDelivery}`;
        }
        break;
      case "Delivered":
        title = "✅ Order Delivered";
        message = `Your order #${args.orderReference} has been successfully delivered. Thank you for shopping with us!`;
        break;
      case "Cancelled":
        title = "❌ Order Cancelled";
        message = `Your order #${args.orderReference} has been cancelled. If you have any questions, please contact support.`;
        break;
    }

    return await ctx.db.insert("notifications", {
      user_id: args.userId,
      type: "order_update",
      status: "unread",
      title,
      message,
      data: {
        type: "status_update",
        orderId: args.orderId,
        orderReference: args.orderReference,
        newStatus: args.newStatus,
        previousStatus: args.previousStatus,
        estimatedDelivery: args.estimatedDelivery,
        route: `/order-details/${args.orderId}`,
        priority: args.newStatus === "Delivered" ? "high" : "normal",
      },
      created_at: now,
      updated_at: now,
    });
  },
});

/**
 * Mark a notification as read
 */
/**
 * @internal Took `userId` as an argument. Use `markMyNotificationRead`.
 */
export const markNotificationAsRead = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);

    if (!notification || notification.user_id !== args.userId) {
      throw new Error("Notification not found or access denied");
    }

    if (notification.status === "read") {
      return notification; // Already read
    }

    const now = Date.now();
    await ctx.db.patch(args.notificationId, {
      status: "read",
      read_at: now,
      updated_at: now,
    });

    return await ctx.db.get(args.notificationId);
  },
});

/**
 * Mark all notifications as read for a user
 */
/**
 * @internal Took `userId` as an argument, and `.collect()`s an unbounded set. Use
 * `markAllMyNotificationsRead`.
 */
export const markAllNotificationsAsRead = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_status", (q) =>
        q.eq("user_id", args.userId).eq("status", "unread")
      )
      .collect();

    // Only mark recent notifications as read (within retention period)
    const cutoffTime = Date.now() - NOTIFICATION_RETENTION_PERIOD;
    const validNotifications = unreadNotifications.filter(
      (n) => n.created_at > cutoffTime
    );

    const now = Date.now();
    const updatePromises = validNotifications.map((notification) =>
      ctx.db.patch(notification._id, {
        status: "read",
        read_at: now,
        updated_at: now,
      })
    );

    await Promise.all(updatePromises);
    return validNotifications.length;
  },
});

/**
 * Delete a notification
 */
/**
 * @internal Took `userId` as an argument. Use `deleteMyNotification`.
 */
export const deleteNotification = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);

    if (!notification || notification.user_id !== args.userId) {
      throw new Error("Notification not found or access denied");
    }

    await ctx.db.delete(args.notificationId);
    return { success: true };
  },
});

/**
 * Delete all read notifications for a user
 */
/**
 * @internal Took `userId` as an argument, and `.collect()`s an unbounded set.
 */
export const deleteReadNotifications = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const readNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_status", (q) =>
        q.eq("user_id", args.userId).eq("status", "read")
      )
      .collect();

    const deletePromises = readNotifications.map((notification) =>
      ctx.db.delete(notification._id)
    );

    await Promise.all(deletePromises);
    return readNotifications.length;
  },
});

/**
 * Create an order update notification (legacy function maintained for compatibility)
 */
export const createOrderNotification = mutation({
  args: {
    userId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    status: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runMutation(
      internal.data.user_notifications.createOrderStatusNotification,
      {
        userId: args.userId,
        orderId: args.orderId,
        orderReference: args.orderReference,
        newStatus: args.status,
      }
    );
  },
});

/**
 * Create a delivery notification (legacy function maintained for compatibility)
 */
export const createDeliveryNotification = mutation({
  args: {
    userId: v.id("users"),
    orderId: v.id("orders"),
    orderReference: v.string(),
    shipmentId: v.optional(v.id("shipments")),
    status: v.string(),
    estimatedTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = "Delivery Update";
    let message = `Your order #${args.orderReference} is ${args.status}.`;

    if (args.estimatedTime) {
      message += ` Estimated arrival: ${args.estimatedTime}`;
    }

    return await ctx.db.insert("notifications", {
      user_id: args.userId,
      type: "delivery",
      status: "unread",
      title,
      message,
      data: {
        orderId: args.orderId,
        orderReference: args.orderReference,
        shipmentId: args.shipmentId,
        deliveryStatus: args.status,
        estimatedTime: args.estimatedTime,
        route: args.shipmentId
          ? "/shipments"
          : `/order-details/${args.orderId}`,
      },
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

/**
 * Create a promotional notification
 */
export const createPromotionalNotification = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    message: v.string(),
    promoCode: v.optional(v.string()),
    discount: v.optional(v.string()),
    validUntil: v.optional(v.string()),
    route: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      user_id: args.userId,
      type: "promotion",
      status: "unread",
      title: args.title,
      message: args.message,
      data: {
        promoCode: args.promoCode,
        discount: args.discount,
        validUntil: args.validUntil,
        route: args.route, // Navigate to shopping
      },
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

/**
 * Create a system notification
 */
export const createSystemNotification = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    message: v.string(),
    actionRoute: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      user_id: args.userId,
      type: "system",
      status: "unread",
      title: args.title,
      message: args.message,
      data: {
        route: args.actionRoute,
      },
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

export const createBulkNotifications = mutation({
  args: {
    userIds: v.array(v.id("users")),
    type: v.union(...notificationTypes.map((e) => v.literal(e))),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const notifications = args.userIds.map((userId) => ({
      user_id: userId,
      type: args.type,
      status: "unread" as const,
      title: args.title,
      message: args.message,
      data: args.data,
      created_at: now,
      updated_at: now,
    }));

    const insertPromises = notifications.map((notification) =>
      ctx.db.insert("notifications", notification)
    );

    const results = await Promise.all(insertPromises);
    return results;
  },
});

/**
 * Get notification statistics for a user
 */
export const getNotificationStats = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - NOTIFICATION_RETENTION_PERIOD;

    const allNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("user_id", args.userId))
      .filter((q) => q.gt(q.field("created_at"), cutoffTime))
      .collect();

    const stats = {
      total: allNotifications.length,
      unread: allNotifications.filter((n) => n.status === "unread").length,
      read: allNotifications.filter((n) => n.status === "read").length,
      byType: {
        order_update: allNotifications.filter((n) => n.type === "order_update")
          .length,
        delivery: allNotifications.filter((n) => n.type === "delivery").length,
        promotion: allNotifications.filter((n) => n.type === "promotion")
          .length,
        system: allNotifications.filter((n) => n.type === "system").length,
      },
      retentionCutoff: cutoffTime,
      retentionDays: 90,
    };

    return stats;
  },
});

// ── The caller's own notifications ────────────────────────────────────────
//
// The functions above take `userId: v.id("users")` as an argument and are public.
// That is not merely an IDOR over a notification feed:
// `createDeliveryCodeNotification` stores the six-digit handover code in the
// notification's message AND in `data.deliveryCode`, so
// `getUserNotifications({ userId })` returned the code that authorises releasing
// someone else's parcel, to an unauthenticated caller.
//
// That is the same disclosure closed on `orders.generateDeliveryCode`, still open
// through a second door — worth stating plainly, because closing one route to a
// secret and leaving another is how a fix comes to be believed.
//
// The six `create*Notification` mutations are equally public, so anyone could
// write into any customer's feed. A notification titled "🔐 Your Delivery Code"
// with an attacker's phone number in it is a complete phishing primitive, and it
// arrives inside the app the customer trusts. They are internal now; the actions
// in `notifications.ts` reach them through `internal.*`.

/**
 * The caller's own notifications, newest first.
 *
 * Signed out returns an empty list rather than throwing: the bell renders in a
 * header that a guest can see.
 */
export const getMyNotifications = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(...notificationReadStatus.map((e) => v.literal(e))),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUserOrNull(ctx);
    if (!user) return [];

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const cutoff = Date.now() - NOTIFICATION_RETENTION_PERIOD;

    const rows = args.status
      ? await ctx.db
          .query("notifications")
          .withIndex("by_user_status", (q) =>
            q.eq("user_id", user.user._id).eq("status", args.status!),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("notifications")
          .withIndex("by_user_created", (q) =>
            q.eq("user_id", user.user._id),
          )
          .order("desc")
          .take(limit);

    return rows
      .filter((n) => n.created_at > cutoff)
      .map((n) => ({
        _id: n._id,
        type: n.type,
        status: n.status,
        title: n.title,
        message: n.message,
        created_at: n.created_at,
        // `data` is `v.any()` — whatever the writer put there. Only the two
        // fields the app navigates by are projected, rather than handing the
        // client an untyped blob whose contents nobody controls.
        orderId: readOrderId(n.data),
        route: readRoute(n.data),
      }));
  },
});

/** How many unread notifications the caller has, capped for display. */
export const getMyUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUserOrNull(ctx);
    if (!user) return 0;

    // Capped read rather than a count of everything: the badge shows "9+" past
    // nine, so reading a thousand rows to render "9+" is wasted work — and an
    // unbounded read is how a query starts throwing at scale.
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_status", (q) =>
        q.eq("user_id", user.user._id).eq("status", "unread"),
      )
      .take(UNREAD_BADGE_CAP + 1);

    const cutoff = Date.now() - NOTIFICATION_RETENTION_PERIOD;
    return rows.filter((n) => n.created_at > cutoff).length;
  },
});

/** Mark one of the caller's own notifications read. */
export const markMyNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const notification = await ctx.db.get(args.notificationId);
    // One message for both cases, so this cannot be used to test whether a
    // notification id exists.
    if (!notification || notification.user_id !== user._id) {
      throw new ConvexError("Notification not found.");
    }
    if (notification.status === "read") return { alreadyRead: true };

    const now = Date.now();
    await ctx.db.patch(args.notificationId, {
      status: "read",
      read_at: now,
      updated_at: now,
    });
    return { alreadyRead: false };
  },
});

/** Mark all of the caller's unread notifications read. */
export const markAllMyNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await getAuthUser(ctx);

    // Bounded. Its predecessor collected the whole unread index, which is
    // unbounded by construction and throws past the document limit — and the
    // customer it throws for is the one who never opened the screen.
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_status", (q) =>
        q.eq("user_id", user._id).eq("status", "unread"),
      )
      .take(MAX_BULK_MARK);

    const cutoff = Date.now() - NOTIFICATION_RETENTION_PERIOD;
    const now = Date.now();
    const marking = rows.filter((n) => n.created_at > cutoff);

    await Promise.all(
      marking.map((n) =>
        ctx.db.patch(n._id, { status: "read", read_at: now, updated_at: now }),
      ),
    );

    return {
      marked: marking.length,
      // True when the cap was hit, so the caller knows another pass is needed
      // rather than believing the feed is clear.
      more: rows.length === MAX_BULK_MARK,
    };
  },
});

/** Delete one of the caller's own notifications. */
export const deleteMyNotification = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.user_id !== user._id) {
      throw new ConvexError("Notification not found.");
    }

    await ctx.db.delete(args.notificationId);
    return { deleted: true };
  },
});
