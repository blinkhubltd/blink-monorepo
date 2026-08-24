import { action } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";

/**
 * Central helpers & unified push notification sending
 * This refactor introduces notifyUser & notifyUsers which:
 *  1. Insert (or ensure) an in-app notification feed record
 *  2. Fetch enabled push tokens from push_tokens table (multi-device)
 *  3. Send Expo push messages in a single batched call (<=100 typical scenario)
 *  4. Return structured result with counts
 *
 * Existing specialized actions delegate to these helpers to avoid duplication.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type BaseNotificationType =
  | "order_update"
  | "delivery"
  | "promotion"
  | "system";

interface UnifiedNotifyArgs {
  userId: Id<"users">;
  type: BaseNotificationType;
  title: string;
  message: string;
  data?: any; // route, orderId, etc.
  sendPush?: boolean; // default true
}

/** Insert feed notification (re-using existing mutation) */
async function insertFeedNotification(
  ctx: any,
  args: UnifiedNotifyArgs,
): Promise<Id<"notifications">> {
  const notificationId: Id<"notifications"> = await ctx.runMutation(
    api.data.user_notifications.createNotification,
    {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      data: args.data,
    },
  );
  return notificationId;
}

/** Fetch enabled push tokens for a user (multi-device) */
interface PushTokenDoc {
  _id: Id<"push_tokens">;
  user_id: Id<"users">;
  token: string;
  platform: string;
  device_id?: string;
  enabled?: boolean;
  last_seen?: number;
  updated_at?: number;
}

async function getUserEnabledTokens(
  ctx: any,
  userId: Id<"users">,
): Promise<PushTokenDoc[]> {
  const tokens: PushTokenDoc[] = await ctx.runQuery(
    api.data.push_tokens.listUserPushTokens,
    {
      userId,
    },
  );
  return tokens.filter((t) => t.enabled !== false && !!t.token);
}

/** Low level send to Expo (accepts array of already shaped messages) */
interface ExpoSendResult {
  success: boolean;
  sent: number;
  result: any;
  error?: any;
  reason?: string;
}

async function sendExpo(messages: any[]): Promise<ExpoSendResult> {
  if (!messages.length)
    return { success: true, sent: 0, result: [], reason: "empty" };
  // Chunk messages to respect Expo recommended max (100 per request)
  const CHUNK_SIZE = 100;
  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + CHUNK_SIZE));
  }
  const aggregate: any[] = [];
  let totalSent = 0;
  for (const chunk of chunks) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
    });
    const result = await response.json();
    aggregate.push({ ok: response.ok, result, count: chunk.length });
    totalSent += chunk.length;
  }
  return { success: true, sent: totalSent, result: aggregate };
}

export const notifyUser = action({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("order_update"),
      v.literal("delivery"),
      v.literal("promotion"),
      v.literal("system"),
    ),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
    sendPush: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const unified: UnifiedNotifyArgs = {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      data: args.data,
      sendPush: args.sendPush !== false,
    };

    // 1. Insert feed record
    let notificationId: Id<"notifications"> | null = null;
    try {
      notificationId = await insertFeedNotification(ctx, unified);
    } catch (e) {
      console.error("Failed to insert feed notification", e);
      // We still optionally send push to not lose critical alert
    }

    // 2. Send push if requested
    let pushResult: any = { success: true, sent: 0 };
    if (unified.sendPush) {
      try {
        const tokens = await getUserEnabledTokens(ctx, unified.userId);
        console.log("[notifyUser] tokens fetched", {
          userId: unified.userId,
          tokenCount: tokens.length,
          type: unified.type,
          title: unified.title,
        });
        if (tokens.length === 0) {
          pushResult = { success: true, sent: 0, reason: "no_tokens" };
        } else {
          const messages = tokens.map((t: any) => ({
            to: t.token,
            sound: "default" as const,
            title: unified.title,
            body: unified.message,
            data: {
              notificationId,
              type: unified.type,
              ...(unified.data || {}),
            },
          }));
          pushResult = await sendExpo(messages);
          console.log("[notifyUser] push send result", {
            userId: unified.userId,
            sent: pushResult.sent,
            success: pushResult.success,
          });
        }
      } catch (err) {
        console.error("Push send failed", err);
        pushResult = { success: false, error: String(err) };
      }
    }

    return {
      notificationId,
      push: pushResult,
    };
  },
});

export const notifyUsers = action({
  args: {
    userIds: v.array(v.id("users")),
    type: v.union(
      v.literal("order_update"),
      v.literal("delivery"),
      v.literal("promotion"),
      v.literal("system"),
    ),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
    sendPush: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const results: any[] = [];
    const allMessages: any[] = [];

    // Insert feed notifications sequentially (Convex limitation) & gather tokens
    for (const userId of args.userIds) {
      let notificationId: Id<"notifications"> | null = null;
      try {
        notificationId = await ctx.runMutation(
          api.data.user_notifications.createNotification,
          {
            userId,
            type: args.type,
            title: args.title,
            message: args.message,
            data: args.data,
          },
        );
      } catch (e) {
        console.error("Failed to insert feed notification (batch)", e);
      }

      if (args.sendPush !== false) {
        try {
          const tokens = await getUserEnabledTokens(ctx, userId);
          tokens.forEach((t: any) => {
            allMessages.push({
              to: t.token,
              sound: "default" as const,
              title: args.title,
              body: args.message,
              data: {
                notificationId,
                type: args.type,
                ...(args.data || {}),
              },
            });
          });
        } catch (err) {
          console.error("Token retrieval failed", err);
        }
      }
      results.push({ userId, notificationId });
    }

    // Batch send push (with chunking)
    let pushBatch: any = { success: true, sent: 0 };
    if (allMessages.length) {
      try {
        pushBatch = await sendExpo(allMessages);
      } catch (err) {
        console.error("Batch push failed", err);
        pushBatch = { success: false, error: String(err) };
      }
    }
    return { results, push: pushBatch };
  },
});

export const notifyRiderAssignment = action({
  args: {
    riderId: v.id("users"),
    orderId: v.id("orders"),
    shipmentId: v.optional(v.id("shipments")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    result?: any;
    error?: any;
  }> => {
    // Get rider details
    const rider = await ctx.runQuery(api.user.users.getRiderById, {
      riderId: args.riderId,
    });
    if (!rider) {
      return { success: false, reason: "rider_not_found" };
    }

    // Get order details
    const orderDetails = await ctx.runQuery(api.data.orders.getOrderById, {
      orderId: args.orderId,
    });
    if (!orderDetails) {
      console.log("Order not found:", args.orderId);
      return { success: false, reason: "order_not_found" };
    }

    // Format delivery address
    const address = orderDetails.address;
    const deliveryAddress = address
      ? `${address.address_1}, ${address.city}`
      : "Address not available";

    const customer = await ctx.runQuery(api.user.users.getUserById, {
      user_id: orderDetails.user_id,
    });

    const customerName =
      customer?.name ||
      `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim() ||
      "Customer";

    // Create feed notification using new specific function
    const notificationResult = await ctx.runMutation(
      api.data.user_notifications.createRiderAssignmentNotification,
      {
        riderId: args.riderId,
        orderId: args.orderId,
        orderReference: orderDetails.reference,
        customerName,
        deliveryAddress,
        shipmentId: args.shipmentId,
      },
    );

    // Also send push notification
    const title = "🚚 New Delivery Assignment!";
    const message = `Order #${orderDetails.reference.slice(-6)} for ${customerName}\nDelivery to: ${deliveryAddress}`;
    const data = {
      type: "delivery_assigned" as const,
      orderId: args.orderId,
      shipmentId: args.shipmentId,
      customData: {
        orderRef: orderDetails.reference,
        customerName,
        deliveryAddress,
      },
      route: `/(tabs)/deliveries`,
    };
    const pushResult = await ctx.runAction(api.data.notifications.notifyUser, {
      userId: args.riderId,
      type: "delivery",
      title,
      message,
      data,
    });
    return {
      success: true,
      result: { notificationId: notificationResult, push: pushResult },
    };
  },
});

/**
 * Notify rider when order is ready for pickup
 */
export const notifyRiderOrderReady = action({
  args: {
    riderId: v.id("users"),
    orderId: v.id("orders"),
    pickupLocation: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    result?: any;
  }> => {
    const order: any = await ctx.runQuery(api.data.orders.getOrderById, {
      orderId: args.orderId,
    });

    if (!order) return { success: false, reason: "order_not_found" };

    // Create feed notification using new specific function
    const notificationResult = await ctx.runMutation(
      api.data.user_notifications.createOrderReadyNotification,
      {
        riderId: args.riderId,
        orderId: args.orderId,
        orderReference: order.reference,
        pickupLocation: args.pickupLocation,
      },
    );

    // Also send push notification
    const title: string = "📦 Order Ready for Pickup!";
    const message: string = `Order #${order.reference.slice(-6)} is ready for you!\nPickup from: ${args.pickupLocation}`;

    const pushResult = await ctx.runAction(api.data.notifications.notifyUser, {
      userId: args.riderId,
      type: "delivery",
      title,
      message,
      data: {
        type: "order_ready",
        orderId: args.orderId,
        pickupLocation: args.pickupLocation,
        route: `/(tabs)/deliveries`,
        customData: {
          orderRef: order.reference,
          pickupLocation: args.pickupLocation,
        },
      },
    });

    return {
      success: true,
      result: { notificationId: notificationResult, push: pushResult },
    };
  },
});

/**
 * Notify all active pickers for a specific vendor about a new order
 */
export const notifyVendorPickers = action({
  args: {
    vendorId: v.id("vendors"),
    orderId: v.id("orders"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    sent?: number;
    result?: any;
    error?: any;
    pickersNotified?: number;
    vendorId?: Id<"vendors">;
  }> => {
    // Get order details first
    const orderDetails = await ctx.runQuery(api.data.orders.getOrderWithItems, {
      orderId: args.orderId,
    });
    if (!orderDetails) {
      console.log("Order not found:", args.orderId);
      return { success: false, reason: "order_not_found" };
    }

    // Verify the order belongs to the specified vendor
    if (orderDetails.vendor_id !== args.vendorId) {
      console.log("Order vendor mismatch:", {
        orderId: args.orderId,
        expectedVendor: args.vendorId,
        actualVendor: orderDetails.vendor_id,
      });
      return { success: false, reason: "vendor_mismatch" };
    }

    // Resolve Picker role id, then fetch pickers with push tokens
    const roles = await ctx.runQuery(api.user.roles.getAllRoles, {});
    const pickerRole = roles.find(
      (role: any) => role.name.trim().toLowerCase() === "picker",
    );

    if (!pickerRole) {
      console.log("Picker role not found");
      return { success: false, reason: "picker_role_not_found" };
    }

    const allPickers = await ctx.runQuery(api.user.users.getUsersWithPushTokens, {
      roleId: pickerRole._id,
    });

    // Filter for pickers assigned to this vendor and active status
    const vendorPickers = [];
    for (const picker of allPickers) {
      const pickerDetails = await ctx.runQuery(api.user.users.getUserById, {
        user_id: picker._id,
      });

      if (
        pickerDetails?.picker_details?.vendor_id === args.vendorId &&
        pickerDetails?.picker_details?.status === "Active"
      ) {
        vendorPickers.push(picker);
      }
    }

    if (vendorPickers.length === 0) {
      console.log(
        "No active pickers with push tokens found for vendor:",
        args.vendorId,
      );
      return { success: false, reason: "no_active_pickers" };
    }

    // Use unified batch notify to ALSO create feed items for each picker
    const pickerIds = vendorPickers.map((p) => p._id as Id<"users">);
    const title = "📋 New Order Available!";
    const message = `Order #${orderDetails.reference} for ${orderDetails.customer_name}\n${orderDetails.items_count} items ready to pick`;
    const batchResult = await ctx.runAction(api.data.notifications.notifyUsers, {
      userIds: pickerIds,
      type: "order_update",
      title,
      message,
      data: {
        type: "order_assigned",
        orderId: args.orderId,
        customData: {
          orderRef: orderDetails.reference,
          customerName: orderDetails.customer_name,
          itemCount: orderDetails.items_count,
        },
        route: "/orders",
      },
    });
    return {
      success: true,
      result: batchResult,
      pickersNotified: pickerIds.length,
      vendorId: args.vendorId,
    };
  },
});

/**
 * Send an order assignment notification to a picker
 */
export const notifyPickerAssignment = action({
  args: {
    pickerId: v.id("users"),
    orderId: v.id("orders"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    result?: any;
    error?: any;
  }> => {
    const pickerUser = await ctx.runQuery(api.user.users.getUserById, {
      user_id: args.pickerId,
    });
    const pickerRole = pickerUser?.role_id
      ? await ctx.runQuery(api.user.roles.getRole, { id: pickerUser.role_id })
      : null;
    if (!pickerUser || pickerRole?.name !== "Picker") {
      return { success: false, reason: "picker_not_found" };
    }

    const orderDetails = await ctx.runQuery(api.data.orders.getOrderWithItems, {
      orderId: args.orderId,
    });
    if (!orderDetails) {
      console.log("Order not found:", args.orderId);
      return { success: false, reason: "order_not_found" };
    }

    const pickerVendorId = pickerUser.picker_details?.vendor_id;
    if (!pickerVendorId || pickerVendorId !== orderDetails.vendor_id) {
      console.log("Picker not assigned to order's vendor:", {
        pickerId: args.pickerId,
        pickerVendor: pickerVendorId,
        orderVendor: orderDetails.vendor_id,
      });
      return { success: false, reason: "vendor_mismatch" };
    }

    const title = "📋 New Order Ready for Pickup!";
    const message = `Order #${orderDetails.reference} for ${orderDetails.customer_name}\n${orderDetails.items_count} items ready to pick`;
    const data = {
      type: "order_assigned" as const,
      orderId: args.orderId,
      customData: {
        orderRef: orderDetails.reference,
        customerName: orderDetails.customer_name,
        itemCount: orderDetails.items_count,
      },
      route: "/orders",
    };
    const result = await ctx.runAction(api.data.notifications.notifyUser, {
      userId: args.pickerId,
      type: "order_update",
      title,
      message,
      data,
    });
    return { success: true, result };
  },
});

/**
 * Send a status update notification
 */
export const notifyStatusUpdate = action({
  args: {
    userId: v.id("users"),
    orderId: v.id("orders"),
    newStatus: v.string(),
    shipmentId: v.optional(v.id("shipments")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    result?: any;
    error?: any;
  }> => {
    // Get user details
    const user = await ctx.runQuery(api.user.users.getUserById, {
      user_id: args.userId,
    });
    if (!user) return { success: false, reason: "user_not_found" };

    const orderDetails = await ctx.runQuery(api.data.orders.getOrderWithItems, {
      orderId: args.orderId,
    });
    if (!orderDetails) {
      console.log("Order not found:", args.orderId);
      return { success: false, reason: "order_not_found" };
    }

    const title = "📬 Order Status Update";
    const message = `Order #${orderDetails.reference} is now ${args.newStatus}`;
    const data = {
      type: "status_update" as const,
      orderId: args.orderId,
      shipmentId: args.shipmentId,
      customData: {
        orderRef: orderDetails.reference,
        newStatus: args.newStatus,
      },
      route: `/order-details/${orderDetails._id}`,
    };
    const result = await ctx.runAction(api.data.notifications.notifyUser, {
      userId: args.userId,
      type: "order_update",
      title,
      message,
      data,
    });
    return { success: true, result };
  },
});

export const sendBatchNotifications = action({
  args: {
    notifications: v.array(
      v.object({
        pushToken: v.string(),
        title: v.string(),
        body: v.string(),
        data: v.any(),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    sent?: number;
    result?: any;
    error?: any;
    pickersNotified?: number;
    vendorId?: Id<"vendors">;
  }> => {
    if (args.notifications.length === 0) return { success: true, sent: 0 };
    // Use new unified batch sender WITHOUT inserting feed records (legacy use case)
    try {
      const messages = args.notifications.map((n) => ({
        to: n.pushToken,
        sound: "default" as const,
        title: n.title,
        body: n.body,
        data: n.data,
      }));
      const result = await sendExpo(messages);
      return { ...result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/**
 * Trigger notifications for order status changes (moved from orderNotifications.ts)
 * Unified to use notifyUser / notifyVendorPickers.
 */
export const triggerOrderStatusNotification = action({
  args: {
    orderId: v.id("orders"),
    newStatus: v.string(),
    previousStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const order = await ctx.runQuery(api.data.orders.getOrderWithItems, {
        orderId: args.orderId,
      });
      if (!order) return { success: false, error: "order_not_found" };
      if (
        order.user_id &&
        (args.newStatus === "Delivery" || args.newStatus === "Delivered")
      ) {
        if (args.newStatus === "Delivery") {
          const title = "\ud83d\ude9a It's On The Way!";
          const message = `Great news – order #${order.reference.slice(-6)} has left the store and is heading to you. Track its journey in real-time.`;
          const data = {
            orderId: args.orderId,
            orderRef: order.reference,
            status: args.newStatus,
            route: `/order-details/${order._id}`,
            track: true,
          };
          await ctx.runAction(api.data.notifications.notifyUser, {
            userId: order.user_id,
            type: "order_update",
            title,
            message,
            data,
          });

          try {
            const freshOrder = await ctx.runQuery(api.data.orders.getOrderById, {
              orderId: args.orderId,
            });
            if (freshOrder && freshOrder.payment_mode === "pay_now") {
              const needsCode =
                !freshOrder.delivery_code ||
                freshOrder.delivery_code_verified === true;
              if (needsCode) {
                console.log(
                  "[triggerOrderStatusNotification] generating delivery code for out-for-delivery",
                  { orderId: args.orderId },
                );
                try {
                  await ctx.runMutation(api.data.orders.generateDeliveryCode, {
                    orderId: args.orderId,
                  });
                } catch (genErr) {
                  console.warn("Delivery code generation skipped", genErr);
                }
              }
              const codedOrder = await ctx.runQuery(api.data.orders.getOrderById, {
                orderId: args.orderId,
              });
              if (
                codedOrder?.delivery_code &&
                !codedOrder.delivery_code_verified
              ) {
                const codeTitle = "\ud83d\udd10 Your Secure Delivery Code";
                const codeMessage = `Use code ${codedOrder.delivery_code} to verify and complete delivery of order #${codedOrder.reference.slice(-6)}. Keep it safe until the rider arrives.`;
                await ctx.runAction(api.data.notifications.notifyUser, {
                  userId: codedOrder.user_id,
                  type: "delivery",
                  title: codeTitle,
                  message: codeMessage,
                  data: {
                    orderId: codedOrder._id,
                    orderRef: codedOrder.reference,
                    deliveryCode: codedOrder.delivery_code,
                    route: `/order-details/${codedOrder._id}`,
                    codePurpose: "verify_delivery",
                  },
                  sendPush: true,
                });
                console.log(
                  "[triggerOrderStatusNotification] delivery code notification sent",
                  { orderId: codedOrder._id },
                );
              }
            }
          } catch (codeErr) {
            console.error(
              "Failed delivery code generation/send during Delivery status",
              codeErr,
            );
          }
        } else if (args.newStatus === "Delivered") {
          // Immediate delivered + rating request (no delayed scheduler)
          const title = "\u2705 Delivered Successfully";
          const message = `Your order #${order.reference.slice(-6)} arrived! Share your delivery experience and help us keep service top-notch.`;
          const data = {
            orderId: args.orderId,
            orderRef: order.reference,
            status: args.newStatus,
            prompt: "rate_rider",
            route: `/rate-rider?orderId=${order._id}`,
          };
          await ctx.runAction(api.data.notifications.notifyUser, {
            userId: order.user_id,
            type: "order_update",
            title,
            message,
            data,
          });
        }
      }
      return { success: true };
    } catch (error) {
      console.error("Failed to trigger status notification:", error);
      return { success: false, error: (error as Error).message };
    }
  },
});

export const updateOrderStatusWithNotifications = action({
  args: {
    orderId: v.id("orders"),
    newStatus: v.union(
      v.literal("Pending"),
      v.literal("Confirmed"),
      v.literal("Processing"),
      v.literal("Pickup"),
      v.literal("Delivery"),
      v.literal("Delivered"),
      v.literal("Cancelled"),
      v.literal("Refunded"),
    ),
  },
  handler: async (ctx, args) => {
    const order: any = await ctx.runQuery(api.data.orders.getOrderById, {
      orderId: args.orderId,
    });
    if (!order) throw new Error("Order not found");
    const previousStatus = order.order_status;
    if (previousStatus === args.newStatus) {
      return { success: true, previousStatus, newStatus: args.newStatus };
    }
    await ctx.runMutation(api.data.orders.updateOrderStatus, {
      orderId: args.orderId,
      status: args.newStatus,
    });
    try {
      await ctx.scheduler.runAfter(
        0,
        api.data.notifications.triggerOrderStatusNotification,
        {
          orderId: args.orderId,
          newStatus: args.newStatus,
          previousStatus,
        },
      );
    } catch (e) {
      console.error("Failed to schedule status notifications", e);
    }
    return { success: true, previousStatus, newStatus: args.newStatus };
  },
});

/**
 * Post-delivery rating reminder (in-app only, scheduled 15 minutes after Delivered)
 */
export const sendDeliveryRatingReminder = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    // Rating reminders are now sent immediately on Delivered status; keep action for backward
    // compatibility but mark as deprecated.
    return { success: false, deprecated: true };
  },
});

/**
 * Send / resend delivery code to customer (pay_now orders) as a push + feed item.
 * Includes minimal context and deep link to order details screen.
 */
export const sendDeliveryCode = action({
  args: {
    orderId: v.id("orders"),
    code: v.string(),
    userId: v.id("users"),
    riderId: v.optional(v.id("users")),
    resend: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    result?: any;
    error?: string;
  }> => {
    try {
      const order = await ctx.runQuery(api.data.orders.getOrderById, {
        orderId: args.orderId,
      });
      if (!order) return { success: false, reason: "order_not_found" };
      if (order.payment_mode !== "pay_now") {
        return { success: false, reason: "not_pay_now" };
      }

      // Create feed notification using new specific function
      const notificationResult = await ctx.runMutation(
        api.data.user_notifications.createDeliveryCodeNotification,
        {
          userId: args.userId,
          orderId: args.orderId,
          orderReference: order.reference,
          deliveryCode: args.code,
          isResend: args.resend,
        },
      );

      // Also send push notification
      const title = args.resend
        ? "🔐 Delivery Code Resent"
        : "🔐 Your Delivery Code";
      const message = `Use code ${args.code} to verify delivery for order ${order.reference.slice(-6).toUpperCase()}. Please keep it private.`;
      const data = {
        orderId: args.orderId,
        orderRef: order.reference,
        deliveryCode: args.code,
        resend: !!args.resend,
        route: `/order-details/${order._id}`,
      };
      const pushResult = await ctx.runAction(api.data.notifications.notifyUser, {
        userId: args.userId,
        type: "delivery",
        title,
        message,
        data,
        sendPush: true,
      });
      return {
        success: true,
        result: { notificationId: notificationResult, push: pushResult },
      };
    } catch (e) {
      console.error("Failed to send delivery code notification", e);
      return { success: false, error: String(e) };
    }
  },
});

/**
 * Notify all users with push tokens about new clearance deals.
 * Sends a single notification per user (not per product).
 * Deep links to /clearance screen on tap.
 */
export const notifyClearanceDeals = action({
  args: {
    dealsCount: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    notified: number;
    push?: any;
    reason?: string;
  }> => {
    // Get all distinct user IDs that have push tokens
    const allTokens: PushTokenDoc[] = await ctx.runQuery(
      api.data.push_tokens.listAllEnabledTokens,
    );

    // Deduplicate user IDs
    const userIdSet = new Set<string>();
    for (const token of allTokens) {
      userIdSet.add(token.user_id);
    }
    const userIds = [...userIdSet] as Id<"users">[];

    if (userIds.length === 0) {
      return { success: true, notified: 0 };
    }

    const title = "🔥 New Clearance Deals!";
    const message =
      args.dealsCount === 1
        ? "A new clearance deal is available near you. Grab it before it's gone!"
        : `${args.dealsCount} new clearance deals available near you. Grab them before they're gone!`;

    const result = await ctx.runAction(api.data.notifications.notifyUsers, {
      userIds,
      type: "promotion" as const,
      title,
      message,
      data: {
        route: "/clearance",
        type: "clearance_deals",
      },
      sendPush: true,
    });

    return {
      success: true,
      notified: userIds.length,
      push: result.push,
    };
  },
});
